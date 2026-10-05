import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { splitStatements } from '../../src/db/sql-file.js';
import { parseLocalDateTime } from '../../src/utils/dates.js';
import { normalizePhone } from '../../src/utils/phone.js';
import { interpretarRespuesta } from '../../src/services/whatsapp/mensajes.js';
import { puedeAvanzar } from '../../src/models/notificacion.model.js';

describe('normalizePhone', () => {
  const opts = { defaultCountryCode: '34' };

  it('normaliza formatos habituales a E.164', () => {
    assert.equal(normalizePhone('600 11 12 22', opts), '+34600111222');
    assert.equal(normalizePhone('0034 600-111-222', opts), '+34600111222');
    assert.equal(normalizePhone('whatsapp:+34600111222', opts), '+34600111222');
    assert.equal(normalizePhone('34600111222', { ...opts, assumeInternational: true }), '+34600111222');
  });

  it('rechaza valores que no son teléfonos', () => {
    assert.equal(normalizePhone('hola', opts), null);
    assert.equal(normalizePhone('123', opts), null);
  });
});

describe('parseLocalDateTime', () => {
  it('interpreta la fecha en hora local', () => {
    const d = parseLocalDateTime('2030-03-10T10:30');
    assert.ok(d);
    assert.equal(d.getHours(), 10);
    assert.equal(d.getMinutes(), 30);
  });

  it('rechaza fechas imposibles', () => {
    assert.equal(parseLocalDateTime('2030-02-31T10:00'), null);
    assert.equal(parseLocalDateTime('2030-01-01T25:00'), null);
    assert.equal(parseLocalDateTime('mañana'), null);
  });
});

describe('interpretarRespuesta', () => {
  it('detecta confirmaciones', () => {
    for (const t of ['SI', 'Sí!!', 'si, allí estaré', '1', 'Confirmo', '👍']) {
      assert.equal(interpretarRespuesta(t), 'confirmar', t);
    }
  });

  it('detecta cancelaciones', () => {
    for (const t of ['NO', 'No puedo ir', 'cancelar', '2']) {
      assert.equal(interpretarRespuesta(t), 'cancelar', t);
    }
  });

  it('marca como desconocido el resto', () => {
    assert.equal(interpretarRespuesta('¿a qué hora era?'), 'desconocida');
    assert.equal(interpretarRespuesta('sino'), 'desconocida');
  });
});

describe('puedeAvanzar (estados de entrega)', () => {
  it('no retrocede si llegan webhooks desordenados', () => {
    assert.equal(puedeAvanzar('enviado', 'entregado'), true);
    assert.equal(puedeAvanzar('leido', 'entregado'), false);
    assert.equal(puedeAvanzar('entregado', 'fallido'), false);
  });
});

describe('splitStatements', () => {
  it('separa sentencias e ignora comentarios', () => {
    const sql = '-- comentario;\nCREATE TABLE a (id INT);\n\n-- otro\nDROP TABLE b;\n';
    assert.deepEqual(splitStatements(sql), ['CREATE TABLE a (id INT)', 'DROP TABLE b']);
  });
});
