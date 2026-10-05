/**
 * Utilidades de fechas puras. Trabajan en la zona horaria del proceso, que se
 * fija a APP_TIMEZONE en config/env.ts (un único local => una única zona).
 */
const LOCAL_DATETIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** 'YYYY-MM-DDTHH:mm[:ss]' (hora local del salón) -> Date. null si es inválida. */
export function parseLocalDateTime(value: string): Date | null {
  const m = LOCAL_DATETIME.exec(value);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map((part) => Number(part ?? 0)) as [number, number, number, number, number, number];
  if (h > 23 || mi > 59 || s > 59) return null;

  const date = new Date(y, mo - 1, d, h, mi, s, 0);
  // Rechaza fechas que JS "corrige" en silencio (31 de febrero -> 3 de marzo)
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

/** 'YYYY-MM-DD' -> Date a las 00:00 locales. null si es inválida. */
export function parseLocalDate(value: string): Date | null {
  return LOCAL_DATE.test(value) ? parseLocalDateTime(`${value}T00:00`) : null;
}

export const addMinutes = (date: Date, minutes: number): Date => new Date(date.getTime() + minutes * 60_000);

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** 'HH:mm' o 'HH:mm:ss' -> minutos desde medianoche */
export function timeToMinutes(value: string): number {
  const [h = 0, m = 0] = value.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Minutos desde la medianoche local de `date` */
export const minutesOfDay = (date: Date): number => date.getHours() * 60 + date.getMinutes();

export function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Dos intervalos [inicio, fin) se solapan si cada uno empieza antes de que acabe el otro */
export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function formatForMessage(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(date);
}
