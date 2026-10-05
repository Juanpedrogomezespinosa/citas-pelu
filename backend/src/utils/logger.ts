/**
 * Logger mínimo con niveles; JSON en producción para poder agregarlo.
 * Toda la app usa esta interfaz, así que cambiar a pino/winston es trivial.
 *
 * Regla: nunca registrar secretos, tokens ni cuerpos completos de peticiones.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';
type Meta = Record<string, unknown>;

const isProd = process.env.NODE_ENV === 'production';

function write(level: Level, message: string, meta: Meta = {}): void {
  const entry = { time: new Date().toISOString(), level, message, ...meta };
  const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;

  if (isProd) {
    out(JSON.stringify(entry));
    return;
  }
  const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  out(`[${entry.time}] ${level.toUpperCase().padEnd(5)} ${message}${extra}`);
}

export const logger = {
  debug: (message: string, meta?: Meta) => {
    if (!isProd) write('debug', message, meta);
  },
  info: (message: string, meta?: Meta) => write('info', message, meta),
  warn: (message: string, meta?: Meta) => write('warn', message, meta),
  error: (message: string, meta?: Meta) => write('error', message, meta),
} as const;
