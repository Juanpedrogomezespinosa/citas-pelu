import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { pool, selectOne } from '../../src/config/database.js';
import { cerrar, crearCitaPasada, diaFuturo, prepararBaseDeDatos, sesion, type Cliente, type Fixtures } from './helpers.js';

let f: Fixtures;
let admin: Cliente;
before(async () => {
  f = await prepararBaseDeDatos();
  admin = await sesion(f.adminEmail);
});
after(cerrar);

const stock = async (id: number) => (await selectOne<{ stock: number }>(pool, 'SELECT stock FROM productos WHERE id = ?', [id]))?.stock;
const hoy = () => diaFuturo(0);

describe('Cobros', () => {
  it('no se puede cobrar una cita que no está completada', async () => {
    const citaId = await crearCitaPasada(f);
    const res = await admin.post('/api/cobros', {
      cita_id: citaId,
      metodo: 'tarjeta',
      lineas: [{ tipo: 'servicio', servicio_id: f.corteId }],
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'CITA_NO_COMPLETADA');
  });

  it('cobra cita + producto, descuenta stock, usa precios del servidor y no permite cobrar dos veces', async () => {
    const citaId = await crearCitaPasada(f);
    await admin.post(`/api/citas/${citaId}/completar`, {});

    const res = await admin.post('/api/cobros', {
      cita_id: citaId,
      metodo: 'efectivo',
      descuento: 2.5,
      lineas: [
        { tipo: 'servicio', servicio_id: f.corteId },
        { tipo: 'producto', producto_id: f.productoId, cantidad: 2 },
      ],
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.subtotal, 45); // 20 + 2 x 12.50
    assert.equal(res.body.data.total, 42.5);
    assert.equal(res.body.data.lineas[0].empleado_id, f.empleadoId, 'el servicio se atribuye al profesional de la cita');
    assert.equal(await stock(f.productoId), 1);
    assert.equal((await admin.get(`/api/citas/${citaId}`)).body.data.cobrada, true);

    const doble = await admin.post('/api/cobros', {
      cita_id: citaId,
      metodo: 'efectivo',
      lineas: [{ tipo: 'servicio', servicio_id: f.corteId }],
    });
    assert.equal(doble.status, 409);
    assert.equal(doble.body.error.code, 'ALREADY_PAID');
  });

  it('sin stock suficiente no se cobra NADA (atomicidad)', async () => {
    const antes = await stock(f.productoId);
    const res = await admin.post('/api/cobros', {
      metodo: 'tarjeta',
      lineas: [
        { tipo: 'servicio', servicio_id: f.corteId },
        { tipo: 'producto', producto_id: f.productoId, cantidad: 5 },
      ],
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'OUT_OF_STOCK');
    assert.equal(await stock(f.productoId), antes);
  });

  it('dos ventas simultáneas de la última unidad: solo una se completa', async () => {
    assert.equal(await stock(f.productoId), 1);
    const venta = () => admin.post('/api/cobros', { metodo: 'bizum', lineas: [{ tipo: 'producto', producto_id: f.productoId }] });
    const codigos = (await Promise.all([venta(), venta(), venta()])).map((r) => r.status).sort();
    assert.deepEqual(codigos, [201, 409, 409]);
    assert.equal(await stock(f.productoId), 0);
  });

  it('anular un cobro repone el stock y permite volver a cobrar la cita', async () => {
    const citaId = await crearCitaPasada(f);
    await admin.post(`/api/citas/${citaId}/completar`, {});
    await admin.put(`/api/productos/${f.productoId}`, { stock: 4 });
    const cobro = await admin.post('/api/cobros', {
      cita_id: citaId,
      metodo: 'tarjeta',
      lineas: [
        { tipo: 'servicio', servicio_id: f.corteId },
        { tipo: 'producto', producto_id: f.productoId },
      ],
    });
    assert.equal(await stock(f.productoId), 3);

    const anulado = await admin.post(`/api/cobros/${cobro.body.data.id}/anular`, { motivo: 'Error en el método de pago' });
    assert.equal(anulado.body.data.estado, 'anulado');
    assert.equal(await stock(f.productoId), 4);

    const otraVez = await admin.post('/api/cobros', {
      cita_id: citaId,
      metodo: 'efectivo',
      lineas: [{ tipo: 'servicio', servicio_id: f.corteId }],
    });
    assert.equal(otraVez.status, 201);
  });

  it('el descuento no puede superar el importe', async () => {
    const res = await admin.post('/api/cobros', {
      metodo: 'efectivo',
      descuento: 50,
      lineas: [{ tipo: 'servicio', servicio_id: f.corteId }],
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_DISCOUNT');
  });
});

describe('Informe de caja', () => {
  it('suma solo cobros vigentes, desglosa por método, servicio, profesional y producto', async () => {
    const res = await admin.get(`/api/informes/caja?desde=${hoy()}&hasta=${hoy()}`);
    assert.equal(res.status, 200);
    const inf = res.body.data;
    // Vigentes: 42.50 (efectivo) + 12.50 (bizum) + 20 (efectivo, recobro). El anulado no cuenta.
    assert.equal(inf.resumen.neto, 75);
    assert.equal(inf.resumen.descuentos, 2.5);
    assert.equal(inf.por_metodo.find((m: { metodo: string }) => m.metodo === 'efectivo').neto, 62.5);
    assert.equal(inf.por_servicio[0].nombre, 'Corte');
    assert.equal(inf.por_profesional[0].empleado_id, f.empleadoId);
    assert.equal(inf.por_producto[0].cantidad, 3);
  });
});
