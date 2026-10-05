import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';
import { cerrar, cliente, getApp, ORIGEN, PASSWORD, prepararBaseDeDatos, sesion, type Fixtures } from './helpers.js';

let f: Fixtures;
before(async () => {
  f = await prepararBaseDeDatos();
});
after(cerrar);

describe('Sesión por cookie', () => {
  it('el login fija una cookie httpOnly y no devuelve el token en el cuerpo', async () => {
    const res = await cliente().post('/api/auth/login', { email: f.adminEmail, password: PASSWORD });
    assert.equal(res.status, 200);
    const cookie = String(res.headers['set-cookie']);
    assert.match(cookie, /peluqueria_session=/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
    assert.equal(res.body.data.token, undefined);
    assert.equal(res.body.data.rol, 'admin');
  });

  it('credenciales incorrectas -> 401 genérico', async () => {
    const res = await cliente().post('/api/auth/login', { email: f.adminEmail, password: 'mala' });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.message, 'Credenciales incorrectas');
  });

  it('CSRF: una petición que modifica datos con cookie pero sin Origin permitido se rechaza', async () => {
    const c = await sesion(f.adminEmail);
    const sinOrigen = await c.agent.post('/api/clientes').send({ nombre: 'X', telefono: '600000001' });
    assert.equal(sinOrigen.status, 403);
    const origenAjeno = await c.agent
      .post('/api/clientes')
      .set('Origin', 'https://malicioso.example')
      .send({ nombre: 'X', telefono: '600000001' });
    assert.equal(origenAjeno.status, 403);
    const legitimo = await c.post('/api/clientes', { nombre: 'X', telefono: '600000001' });
    assert.equal(legitimo.status, 201);
  });

  it('logout borra la cookie', async () => {
    const c = await sesion(f.adminEmail);
    await c.post('/api/auth/logout');
    assert.equal((await c.get('/api/auth/me')).status, 401);
  });
});

describe('Contraseñas y revocación de sesiones', () => {
  it('cambiar la contraseña invalida las demás sesiones del usuario', async () => {
    const otraSesion = await sesion(f.recepcionEmail);
    const c = await sesion(f.recepcionEmail);
    const res = await c.put('/api/auth/password', { actual: PASSWORD, nueva: 'NuevaClave2026x' });
    assert.equal(res.status, 200);
    assert.equal((await c.get('/api/auth/me')).status, 200, 'la sesión actual sigue viva');
    assert.equal((await otraSesion.get('/api/auth/me')).status, 401, 'la otra sesión queda revocada');
    // restaurar para el resto de tests
    await c.put('/api/auth/password', { actual: 'NuevaClave2026x', nueva: PASSWORD });
  });

  it('un usuario nuevo debe cambiar la contraseña temporal antes de usar la app', async () => {
    const admin = await sesion(f.adminEmail);
    const alta = await admin.post('/api/usuarios', { nombre: 'Estilista', email: 'estilista@test.local', rol: 'empleado' });
    assert.equal(alta.status, 201);
    const temporal: string = alta.body.data.password_temporal;
    assert.match(temporal, /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{14}$/);

    const nuevo = await sesion('estilista@test.local', temporal);
    assert.equal((await nuevo.get('/api/auth/me')).body.data.debe_cambiar_password, true);
    const bloqueado = await nuevo.get('/api/citas');
    assert.equal(bloqueado.status, 403);
    assert.equal(bloqueado.body.error.code, 'PASSWORD_CHANGE_REQUIRED');

    assert.equal((await nuevo.put('/api/auth/password', { actual: temporal, nueva: 'MiClavePropia99' })).status, 200);
    assert.equal((await nuevo.get('/api/citas')).status, 200);
  });

  it('restablecer la contraseña desde administración cierra las sesiones del usuario', async () => {
    const admin = await sesion(f.adminEmail);
    const usuario = await sesion('estilista@test.local', 'MiClavePropia99');
    const lista = await admin.get('/api/usuarios');
    const id = lista.body.data.find((u: { email: string }) => u.email === 'estilista@test.local').id;

    const reset = await admin.post(`/api/usuarios/${id}/restablecer-password`);
    assert.equal(reset.status, 200);
    assert.equal((await usuario.get('/api/auth/me')).status, 401);
  });
});

describe('Roles', () => {
  it('recepción no accede a la gestión de usuarios ni a informes', async () => {
    const c = await sesion(f.recepcionEmail);
    assert.equal((await c.get('/api/usuarios')).status, 403);
    assert.equal((await c.get('/api/informes/caja?desde=2026-01-01&hasta=2026-01-31')).status, 403);
  });

  it('un empleado no puede reservar citas pero sí ver la agenda', async () => {
    const admin = await sesion(f.adminEmail);
    const alta = await admin.post('/api/usuarios', { nombre: 'Otro', email: 'otro@test.local', rol: 'empleado' });
    const c = await sesion('otro@test.local', alta.body.data.password_temporal);
    await c.put('/api/auth/password', { actual: alta.body.data.password_temporal, nueva: 'ClaveEmpleado77' });
    assert.equal((await c.get('/api/citas')).status, 200);
    assert.equal((await c.post('/api/citas', {})).status, 403);
  });

  it('siempre queda al menos un administrador activo', async () => {
    const admin = await sesion(f.adminEmail);
    const yo = (await admin.get('/api/auth/me')).body.data;
    const res = await admin.patch(`/api/usuarios/${yo.id}`, { rol: 'recepcion' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'SELF_LOCKOUT');
  });
});

describe('Salud y métricas', () => {
  it('health/ready informa de BD y cola', async () => {
    const res = await request(getApp()).get('/api/health/ready');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.db, 'ok');
  });

  it('las métricas exigen el token', async () => {
    assert.equal((await request(getApp()).get('/api/metrics')).status, 401);
    const res = await request(getApp())
      .get('/api/metrics')
      .set('Authorization', 'Bearer token-de-metricas-para-tests')
      .set('Origin', ORIGEN);
    assert.equal(res.status, 200);
    assert.match(res.text, /outbox_pendientes/);
  });
});
