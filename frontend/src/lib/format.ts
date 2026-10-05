/**
 * Formateo de fechas, horas y moneda (es-ES). Las fechas "clave" del
 * calendario se manejan como 'YYYY-MM-DD' en hora local.
 */
import type { EstadoCita } from './types';

const fecha = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const fechaCorta = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
const hora = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });
const mesAnio = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });
const euros = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

const toDate = (value: string | Date) => (value instanceof Date ? value : new Date(value));

export const formatFecha = (value: string | Date) => fecha.format(toDate(value));
export const formatFechaCorta = (value: string | Date) => fechaCorta.format(toDate(value));
export const formatHora = (value: string | Date) => hora.format(toDate(value));
export const formatMesAnio = (value: Date) => mesAnio.format(value);
export const formatEuros = (value: number) => euros.format(value);

export function formatDuracion(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
}

/** Date -> 'YYYY-MM-DD' (hora local) */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 'YYYY-MM-DD' -> Date a las 00:00 locales */
export function fromDateKey(key: string): Date {
  const [y = 1970, m = 1, d = 1] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const todayKey = (): string => toDateKey(new Date());

/** ISO -> 'HH:mm' local */
export function toTimeKey(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const ESTADO_LABEL: Readonly<Record<EstadoCita, string>> = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  completada: 'Completada',
  cancelada: 'Cancelada',
  no_asistio: 'No asistió',
};

export const nombreCompleto = (p: { nombre: string; apellidos: string | null }) => [p.nombre, p.apellidos].filter(Boolean).join(' ');

/** 42 días (6 semanas, de lunes a domingo) que muestra el calendario de un mes */
export function diasDelMes(month: Date): Date[] {
  const primero = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (primero.getDay() + 6) % 7; // lunes = 0
  const inicio = new Date(primero);
  inicio.setDate(1 - offset);
  // 6 semanas fijas: el calendario no "salta" de altura entre meses
  return Array.from({ length: 42 }, (_, i) => new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i));
}
