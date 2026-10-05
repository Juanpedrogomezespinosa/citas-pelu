import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calcularHuecos, encajaEnVentanas, ventanasLaborables } from '../../src/services/agenda.js';

const NEGOCIO = { apertura: '09:00', cierre: '20:00' };
const at = (h: number, m = 0) => new Date(2030, 0, 15, h, m); // martes 15/01/2030

describe('ventanasLaborables', () => {
  it('usa el horario del local si el empleado no tiene horario', () => {
    assert.deepEqual(ventanasLaborables(2, [], NEGOCIO), [{ inicio: 540, fin: 1200 }]);
  });

  it('recorta el horario del empleado al del local y filtra por día', () => {
    const horarios = [
      { dia_semana: 2, hora_inicio: '08:00', hora_fin: '14:00' },
      { dia_semana: 3, hora_inicio: '10:00', hora_fin: '12:00' },
    ];
    assert.deepEqual(ventanasLaborables(2, horarios, NEGOCIO), [{ inicio: 540, fin: 840 }]);
  });

  it('devuelve vacío si el empleado no trabaja ese día', () => {
    assert.deepEqual(ventanasLaborables(0, [{ dia_semana: 2, hora_inicio: '09:00', hora_fin: '14:00' }], NEGOCIO), []);
  });
});

describe('encajaEnVentanas', () => {
  const ventanas = [
    { inicio: 540, fin: 840 },
    { inicio: 960, fin: 1200 },
  ];

  it('acepta una cita completamente dentro de una ventana', () => {
    assert.equal(encajaEnVentanas(at(13), at(14), ventanas), true);
  });

  it('rechaza una cita que cruza la pausa de mediodía', () => {
    assert.equal(encajaEnVentanas(at(13, 30), at(16, 30), ventanas), false);
  });

  it('rechaza una cita antes de abrir', () => {
    assert.equal(encajaEnVentanas(at(8, 45), at(9, 30), ventanas), false);
  });
});

describe('calcularHuecos', () => {
  it('excluye huecos ocupados, pasados y los que no caben antes del cierre', () => {
    const huecos = calcularHuecos({
      dia: new Date(2030, 0, 15),
      duracionMinutos: 60,
      ventanas: [{ inicio: 540, fin: 720 }], // 09:00-12:00
      ocupadas: [{ fecha_inicio: at(10), fecha_fin: at(10, 30) }],
      intervaloMinutos: 30,
      ahora: at(9, 10),
    });
    // 09:00 ya pasó; 09:30 y 10:00 chocan con 10:00-10:30; 11:30 no cabe (acabaría 12:30)
    assert.deepEqual(huecos, ['10:30', '11:00']);
  });
});
