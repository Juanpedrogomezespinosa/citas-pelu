import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';
import { pool, selectOne } from '../../src/config/database.js';
import { OutboxWorker } from '../../src/services/outbox.service.js';
import { usarProveedorDePruebas, type WhatsAppProvider } from '../../src/services/whatsapp/index.js';
import { cerrar, diaFuturo, prepararBaseDeDatos, sesion, type Cliente, type Fixtures } from './helpers.js';

let f: Fixtures;
let admin: Cliente;
before(async () => {
  f = await prepararBaseDeDatos();
  admin = await sesion(f.adminEmail);
});
afterEach(() => usarProveedorDePruebas(null));
after(cerrar);

const proveedorQueFalla: WhatsAppProvider = {
  nombre: 'console',
  enviar: () => Promise.reject(new Error('Proveedor caído (simulado)')),
  parsearWebhook: () => ({ mensajes: [], estados: [] }),
};

const estadoNotificacion = (citaId: number) =>
  selectOne<{ id: number; estado: string; intentos: number; proximo_intento_en: Date | null; error: string | null }>(
    pool,
    "SELECT id, estado, intentos, proximo_intento_en, error FROM notificaciones WHERE cita_id = ? AND tipo = 'confirmacion_cita'",
    [citaId],
  );

describe('Outbox de WhatsApp', () => {
  it('si el proveedor falla, la reserva se guarda igual y el mensaje se reintenta con backoff hasta marcarse fallido', async () => {
    usarProveedorDePruebas(proveedorQueFalla);
    const res = await admin.post('/api/citas', {
      cliente_id: f.clienteId,
      empleado_id: f.empleadoId,
      fecha_inicio: `${diaFuturo(3)}T10:00`,
      servicios: [f.corteId],
    });
    assert.equal(res.status, 201, 'un fallo de WhatsApp nunca rompe la reserva');
    const citaId: number = res.body.data.id;

    await OutboxWorker.procesarAhora();
    let n = await estadoNotificacion(citaId);
    assert.equal(n?.estado, 'pendiente');
    assert.equal(n?.intentos, 1);
    assert.ok(n?.proximo_intento_en && n.proximo_intento_en > new Date(), 'el reintento se programa en el futuro');

    // Simula el paso del tiempo hasta agotar los reintentos
    for (let i = 0; i < 4; i++) {
      await pool.execute('UPDATE notificaciones SET proximo_intento_en = NOW() - INTERVAL 1 MINUTE WHERE id = ?', [n?.id ?? 0]);
      await OutboxWorker.procesarAhora();
    }
    n = await estadoNotificacion(citaId);
    assert.equal(n?.estado, 'fallido');
    assert.equal(n?.intentos, 5);
    assert.match(n?.error ?? '', /Proveedor caído/);

    // Reintento manual desde el panel con el proveedor ya recuperado
    usarProveedorDePruebas(null);
    const reintento = await admin.post(`/api/notificaciones/${n?.id ?? 0}/reintentar`);
    assert.equal(reintento.status, 200);
    assert.equal(reintento.body.data.estado, 'enviado');
  });

  it('el recordatorio manual se envía en el momento y devuelve el resultado', async () => {
    const cita = await admin.post('/api/citas', {
      cliente_id: f.clienteId,
      empleado_id: f.empleadoId,
      fecha_inicio: `${diaFuturo(4)}T10:00`,
      servicios: [f.corteId],
    });
    const res = await admin.post(`/api/citas/${cita.body.data.id}/recordatorio`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.tipo, 'recordatorio');
    assert.equal(res.body.data.estado, 'enviado');
    assert.equal(res.body.data.plantilla_clave, 'recordatorio');
  });

  it('sin consentimiento de WhatsApp no se encola nada', async () => {
    await admin.put(`/api/clientes/${f.clienteId}`, { acepta_whatsapp: false });
    const cita = await admin.post('/api/citas', {
      cliente_id: f.clienteId,
      empleado_id: f.empleadoId,
      fecha_inicio: `${diaFuturo(5)}T10:00`,
      servicios: [f.corteId],
    });
    assert.equal(await estadoNotificacion(cita.body.data.id), null);
    const recordatorio = await admin.post(`/api/citas/${cita.body.data.id}/recordatorio`);
    assert.equal(recordatorio.status, 422);
  });
});
