import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { pool, selectOne } from '../../src/config/database.js';
import { anonimizarClientesInactivos } from '../../src/services/jobs.js';
import { cerrar, crearCitaPasada, diaFuturo, prepararBaseDeDatos, sesion, type Cliente, type Fixtures } from './helpers.js';

let f: Fixtures;
let admin: Cliente;
before(async () => {
  f = await prepararBaseDeDatos();
  admin = await sesion(f.adminEmail);
});
after(cerrar);

describe('Bajas con citas pendientes', () => {
  it('dar de baja a un cliente con citas futuras se rechaza mostrando las citas', async () => {
    await admin.post('/api/citas', {
      cliente_id: f.clienteId,
      empleado_id: f.empleadoId,
      fecha_inicio: `${diaFuturo(5)}T10:00`,
      servicios: [f.corteId],
    });
    const res = await admin.delete(`/api/clientes/${f.clienteId}`);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'HAS_FUTURE_APPOINTMENTS');
    assert.equal(res.body.error.details.citas.length, 1);
  });

  it('con cancelar_citas=true cancela las citas, encola el aviso y da de baja, todo junto', async () => {
    const res = await admin.delete(`/api/clientes/${f.clienteId}?cancelar_citas=true`);
    assert.equal(res.status, 204);
    const cliente = (await admin.get(`/api/clientes/${f.clienteId}`)).body.data;
    assert.equal(cliente.activo, false);
    const aviso = await selectOne<{ n: number }>(
      pool,
      "SELECT COUNT(*) AS n FROM notificaciones WHERE cliente_id = ? AND tipo = 'cancelacion'",
      [f.clienteId],
    );
    assert.equal(Number(aviso?.n), 1);
    await admin.post(`/api/clientes/${f.clienteId}/reactivar`);
  });

  it('dar de baja a un profesional con citas futuras exige resolverlas', async () => {
    await admin.post('/api/citas', {
      cliente_id: f.clienteId,
      empleado_id: f.empleado2Id,
      fecha_inicio: `${diaFuturo(6)}T10:00`,
      servicios: [f.corteId],
    });
    const res = await admin.delete(`/api/empleados/${f.empleado2Id}`);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'HAS_FUTURE_APPOINTMENTS');

    // La baja solo va por DELETE: un PUT no puede saltarse la comprobación de citas
    assert.equal((await admin.put(`/api/empleados/${f.empleado2Id}`, { activo: false })).status, 400);

    assert.equal((await admin.delete(`/api/empleados/${f.empleado2Id}?cancelar_citas=true`)).status, 204);
    const reactivado = await admin.post(`/api/empleados/${f.empleado2Id}/reactivar`);
    assert.equal(reactivado.body.data.activo, true);
  });
});

describe('RGPD', () => {
  it('exporta todos los datos del cliente', async () => {
    const res = await admin.get(`/api/clientes/${f.clienteId}/exportar`);
    assert.equal(res.status, 200);
    assert.match(String(res.headers['content-disposition']), /attachment/);
    assert.equal(res.body.data.cliente.telefono, f.clienteTelefono);
    assert.ok(res.body.data.citas.length >= 2);
    assert.ok(res.body.data.mensajes_whatsapp.length >= 1);
  });

  it('no anonimiza con citas futuras; tras cancelarlas, borra los datos personales pero conserva la contabilidad', async () => {
    // Cita futura propia del test (no depender del estado que dejen los anteriores)
    await admin.post('/api/citas', {
      cliente_id: f.clienteId,
      empleado_id: f.empleadoId,
      fecha_inicio: `${diaFuturo(8)}T10:00`,
      servicios: [f.corteId],
    });
    const bloqueada = await admin.post(`/api/clientes/${f.clienteId}/anonimizar`);
    assert.equal(bloqueada.status, 409);

    // Una visita completada y cobrada con notas técnicas (datos de salud)
    const pasada = await crearCitaPasada(f, f.tinteId);
    await admin.post(`/api/citas/${pasada}/completar`, {
      notas_tecnicas: [{ servicio_id: f.tinteId, notas: 'Alergia PPD: usar sin amoniaco' }],
    });
    await admin.post('/api/cobros', { cita_id: pasada, metodo: 'tarjeta', lineas: [{ tipo: 'servicio', servicio_id: f.tinteId }] });

    await admin.delete(`/api/clientes/${f.clienteId}?cancelar_citas=true`);
    const res = await admin.post(`/api/clientes/${f.clienteId}/anonimizar`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.nombre, 'Cliente anonimizado');
    assert.equal(res.body.data.telefono, null);
    assert.ok(res.body.data.anonimizado_en);

    const notas = await selectOne<{ notas_tecnicas: string | null }>(pool, 'SELECT notas_tecnicas FROM cita_servicios WHERE cita_id = ?', [
      pasada,
    ]);
    assert.equal(notas?.notas_tecnicas, null);
    const mensajes = await selectOne<{ n: number }>(
      pool,
      "SELECT COUNT(*) AS n FROM notificaciones WHERE cliente_id = ? AND telefono <> ''",
      [f.clienteId],
    );
    assert.equal(Number(mensajes?.n), 0);
    // La contabilidad se mantiene
    const informe = (await admin.get(`/api/informes/caja?desde=${diaFuturo(0)}&hasta=${diaFuturo(0)}`)).body.data;
    assert.equal(informe.resumen.neto, 35.5);
    // Y no se puede editar ni reactivar
    assert.equal((await admin.put(`/api/clientes/${f.clienteId}`, { nombre: 'Otra' })).status, 409);
  });

  it('la anonimización automática solo afecta a clientes inactivos durante la retención', async () => {
    await pool.execute("INSERT INTO clientes (nombre, telefono, created_at) VALUES ('Antiguo', '+34699999999', NOW() - INTERVAL 5 YEAR)");
    const total = await anonimizarClientesInactivos();
    assert.equal(total, 1);
    const antiguo = await selectOne<{ telefono: string | null }>(
      pool,
      "SELECT telefono FROM clientes WHERE nombre = 'Cliente anonimizado' AND telefono IS NULL AND id <> ?",
      [f.clienteId],
    );
    assert.ok(antiguo);
  });
});
