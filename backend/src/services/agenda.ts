/**
 * Reglas de agenda como funciones PURAS (sin BD ni Express): fáciles de
 * razonar y de testear (ver test/agenda.test.ts).
 */
import type { TramoHorario } from '../models/empleado.model.js';
import { addMinutes, isSameLocalDay, minutesOfDay, minutesToTime, rangesOverlap, timeToMinutes } from '../utils/dates.js';

/** Ventana laborable dentro de un día, en minutos desde medianoche: [inicio, fin) */
export interface Ventana {
  readonly inicio: number;
  readonly fin: number;
}

export interface HorarioNegocio {
  readonly apertura: string; // 'HH:mm'
  readonly cierre: string; // 'HH:mm'
}

export interface Intervalo {
  readonly fecha_inicio: Date;
  readonly fecha_fin: Date;
}

/**
 * Ventanas en las que el empleado puede atender un día de la semana:
 * su horario (o el del local si no tiene ninguno) recortado al horario del local.
 */
export function ventanasLaborables(diaSemana: number, horarios: readonly TramoHorario[], negocio: HorarioNegocio): Ventana[] {
  const apertura = timeToMinutes(negocio.apertura);
  const cierre = timeToMinutes(negocio.cierre);

  const tramos =
    horarios.length === 0
      ? [{ inicio: apertura, fin: cierre }]
      : horarios
          .filter((h) => h.dia_semana === diaSemana)
          .map((h) => ({ inicio: timeToMinutes(h.hora_inicio), fin: timeToMinutes(h.hora_fin) }));

  return tramos
    .map((t) => ({ inicio: Math.max(t.inicio, apertura), fin: Math.min(t.fin, cierre) }))
    .filter((v) => v.fin > v.inicio)
    .sort((a, b) => a.inicio - b.inicio);
}

/** ¿La cita [inicio, fin) cabe entera dentro de alguna ventana del mismo día? */
export function encajaEnVentanas(inicio: Date, fin: Date, ventanas: readonly Ventana[]): boolean {
  // fin - 1 min: una cita que acaba justo a medianoche sigue siendo "del mismo día"
  if (!isSameLocalDay(inicio, addMinutes(fin, -1))) return false;
  const desde = minutesOfDay(inicio);
  const hasta = desde + Math.round((fin.getTime() - inicio.getTime()) / 60_000);
  return ventanas.some((v) => desde >= v.inicio && hasta <= v.fin);
}

export interface ParametrosHuecos {
  /** Día a consultar, a las 00:00 locales */
  readonly dia: Date;
  readonly duracionMinutos: number;
  readonly ventanas: readonly Ventana[];
  readonly ocupadas: readonly Intervalo[];
  readonly intervaloMinutos: number;
  readonly ahora: Date;
}

/** Horas de inicio libres ('HH:mm') donde cabe una cita de la duración dada */
export function calcularHuecos(p: ParametrosHuecos): string[] {
  const huecos: string[] = [];

  for (const v of p.ventanas) {
    for (let m = v.inicio; m + p.duracionMinutos <= v.fin; m += p.intervaloMinutos) {
      // setHours respeta los cambios de horario (DST) mejor que sumar milisegundos
      const inicio = new Date(p.dia);
      inicio.setHours(0, m, 0, 0);
      const fin = addMinutes(inicio, p.duracionMinutos);

      if (inicio <= p.ahora) continue;
      if (p.ocupadas.some((o) => rangesOverlap(inicio, fin, o.fecha_inicio, o.fecha_fin))) continue;
      huecos.push(minutesToTime(m));
    }
  }
  return huecos;
}
