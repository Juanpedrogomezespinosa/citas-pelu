import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { pool, select } from '../../src/config/database.js';
import { OutboxWorker } from '../../src/services/outbox.service.js';
import { WhatsAppEntranteService } from '../../src/services/whatsapp-entrante.service.js';
import { cerrar, crearCitaPasada, diaFuturo, prepararBaseDeDatos, sesion, type Cliente, type Fixtures } from './helpers.js';

let f: Fixtures;
let admin: Cliente;
before(async () => {
  f = await prepararBaseDeDatos();
  admin = await sesion(f.adminEmail);
});
after(cerrar);

const notificacionesDeCita = (citaId: number) =>
  select<{ tipo: string; estado: string; plantilla_clave: string | null }>(
    pool,
    'SELECT tipo, estado, plantilla_clave FROM notificaciones WHERE cita_id = ? ORDER BY id',
    [citaId],
  );

describe('Reservas', () => {
  it('crear una cita encola la confirmación en la misma transacción (outbox) y el worker la envía', async () => {
    const res = await admin.post('/api/citas', {
      cliente_id: f.clienteId,
      empleado_id: f.empleadoId,
      fecha_inicio: `${diaFuturo(10)}T10:00`,
      servicios: [f.corteId, f.tinteId],
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.precio_total, 55.5);
    assert.equal(res.body.data.cobrada, false);

    await OutboxWorker.procesarAhora();
    const [n] = await notificacionesDeCita(res.body.data.id);
    assert.equal(n?.tipo, 'confirmacion_cita');
    assert.equal(n?.estado, 'enviado');
    assert.equal(n?.plantilla_clave, 'confirmacion');
  });

  it('5 reservas simultáneas del mismo hueco: solo una entra', async () => {
    const fecha = `${diaFuturo(11)}T12:00`;
    const respuestas = await Promise.all(
      Array.from({ length: 5 }, () =>
        admin.post('/api/citas', { cliente_id: f.clienteId, empleado_id: f.empleadoId, fecha_inicio: fecha, servicios: [f.corteId] }),
      ),
    );
    const codigos = respuestas.map((r) => r.status).sort();
    assert.deepEqual(codigos, [201, 409, 409, 409, 409]);
  });

  it('una edición con versión obsoleta se rechaza (bloqueo optimista)', async () => {
    const cita = await admin.post('/api/citas', {
      cliente_id: f.clienteId,
      empleado_id: f.empleadoId,
      fecha_inicio: `${diaFuturo(12)}T10:00`,
      servicios: [f.corteId],
    });
    const { id, version } = cita.body.data;
    assert.equal((await admin.patch(`/api/citas/${id}`, { version, notas: 'primera edición' })).status, 200);
    const obsoleta = await admin.patch(`/api/citas/${id}`, { version, notas: 'segunda edición con versión vieja' });
    assert.equal(obsoleta.status, 409);
    assert.equal(obsoleta.body.error.code, 'VERSION_CONFLICT');
  });

  it('reprogramar encola el aviso de cambio y la cita vuelve a pendiente', async () => {
    const cita = await admin.post('/api/citas', {
      cliente_id: f.clienteId,
      empleado_id: f.empleadoId,
      fecha_inicio: `${diaFuturo(13)}T10:00`,
      servicios: [f.corteId],
    });
    const { id, version } = cita.body.data;
    await admin.patch(`/api/citas/${id}/estado`, { estado: 'confirmada' });
    const res = await admin.patch(`/api/citas/${id}`, { version: version + 1, fecha_inicio: `${diaFuturo(13)}T16:00` });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.estado, 'pendiente');
    const tipos = (await notificacionesDeCita(id)).map((n) => n.tipo);
    assert.deepEqual(tipos, ['confirmacion_cita', 'cambio_cita']);
  });
});

describe('Bloqueos de agenda', () => {
  it('no se puede reservar en un periodo bloqueado y la disponibilidad lo excluye', async () => {
    const dia = diaFuturo(20);
    const bloqueo = await admin.post('/api/bloqueos', {
      empleado_id: f.empleadoId,
      tipo: 'vacaciones',
      fecha_inicio: `${dia}T09:00`,
      fecha_fin: `${dia}T14:00`,
    });
    assert.equal(bloqueo.status, 201);

    const reserva = await admin.post('/api/citas', {
      cliente_id: f.clienteId,
      empleado_id: f.empleadoId,
      fecha_inicio: `${dia}T10:00`,
      servicios: [f.corteId],
    });
    assert.equal(reserva.status, 409);
    assert.equal(reserva.body.error.code, 'BLOCKED');

    const huecos: string[] = (await admin.get(`/api/citas/disponibilidad?empleado_id=${f.empleadoId}&fecha=${dia}&duracion=30`)).body.data
      .huecos;
    assert.equal(huecos[0], '14:00');
    // El otro profesional no está afectado
    const otro = await admin.post('/api/citas', {
      cliente_id: f.clienteId,
      empleado_id: f.empleado2Id,
      fecha_inicio: `${dia}T10:00`,
      servicios: [f.corteId],
    });
    assert.equal(otro.status, 201);
  });

  it('un festivo (todo el local) no se puede crear encima de citas activas', async () => {
    const dia = diaFuturo(20);
    const res = await admin.post('/api/bloqueos', { tipo: 'festivo', fecha_inicio: `${dia}T00:00`, fecha_fin: `${diaFuturo(21)}T00:00` });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'HAS_APPOINTMENTS');
    assert.equal(res.body.error.details.citas.length, 1);
  });
});

describe('Completar cita con notas técnicas', () => {
  it('no se puede completar una cita futura', async () => {
    const cita = await admin.post('/api/citas', {
      cliente_id: f.clienteId,
      empleado_id: f.empleadoId,
      fecha_inicio: `${diaFuturo(14)}T10:00`,
      servicios: [f.corteId],
    });
    const res = await admin.post(`/api/citas/${cita.body.data.id}/completar`, {});
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'NOT_STARTED');
  });

  it('completa y guarda la fórmula, que aparece en el historial del cliente', async () => {
    const id = await crearCitaPasada(f, f.tinteId);
    const res = await admin.post(`/api/citas/${id}/completar`, {
      notas_tecnicas: [{ servicio_id: f.tinteId, notas: '6.34 + 20 vol, 35 min' }],
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.estado, 'completada');
    assert.equal(res.body.data.servicios[0].notas_tecnicas, '6.34 + 20 vol, 35 min');

    const historial = (await admin.get(`/api/clientes/${f.clienteId}/historial`)).body.data;
    const visita = historial.visitas.find((v: { cita_id: number }) => v.cita_id === id);
    assert.equal(visita.servicios[0].notas_tecnicas, '6.34 + 20 vol, 35 min');
    assert.equal(historial.estadisticas.total_visitas, 1);

    const correccion = await admin.put(`/api/citas/${id}/notas-tecnicas`, {
      notas_tecnicas: [{ servicio_id: f.tinteId, notas: '6.34 + 30 vol' }],
    });
    assert.equal(correccion.body.data.servicios[0].notas_tecnicas, '6.34 + 30 vol');
  });
});

describe('Respuestas por WhatsApp', () => {
  it('"SI" confirma la cita del último aviso y encola la respuesta automática', async () => {
    const cita = await admin.post('/api/citas', {
      cliente_id: f.clienteId,
      empleado_id: f.empleado2Id,
      fecha_inicio: `${diaFuturo(30)}T11:00`,
      servicios: [f.corteId],
    });
    const res = await admin.post('/api/webhooks/whatsapp/simular', { telefono: f.clienteTelefono, mensaje: 'Sí, allí estaré 👍' });
    assert.equal(res.body.data.accion, 'confirmada');
    assert.equal(res.body.data.citaId, cita.body.data.id);
    assert.equal((await admin.get(`/api/citas/${cita.body.data.id}`)).body.data.confirmada_via, 'whatsapp');
  });

  it('un webhook repetido (mismo id de mensaje) no se procesa dos veces', async () => {
    const cita = await admin.post('/api/citas', {
      cliente_id: f.clienteId,
      empleado_id: f.empleado2Id,
      fecha_inicio: `${diaFuturo(31)}T11:00`,
      servicios: [f.corteId],
    });
    const mensaje = { from: f.clienteTelefono, body: 'NO', providerMessageId: 'wamid.repetido-1' };
    const primera = await WhatsAppEntranteService.procesarMensajeEntrante(mensaje);
    const segunda = await WhatsAppEntranteService.procesarMensajeEntrante(mensaje);
    assert.equal(primera.accion, 'cancelada');
    assert.equal(segunda.accion, 'duplicado');
    const respuestas = await select<{ n: number }>(
      pool,
      "SELECT COUNT(*) AS n FROM notificaciones WHERE cita_id = ? AND tipo = 'respuesta_automatica'",
      [cita.body.data.id],
    );
    assert.equal(Number(respuestas[0]?.n), 1);
    // Cancelación pedida por el cliente: no se le envía además el aviso de cancelación
    const tipos = (await notificacionesDeCita(cita.body.data.id)).map((n) => n.tipo);
    assert.ok(!tipos.includes('cancelacion'));
  });
});
