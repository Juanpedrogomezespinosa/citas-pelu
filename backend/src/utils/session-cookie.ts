/**
 * Cookie de sesión.
 *
 * El JWT viaja en una cookie httpOnly (inaccesible para JavaScript, así que un
 * XSS no puede robarlo), Secure en producción y SameSite=Strict (el navegador
 * no la adjunta en peticiones iniciadas desde otros sitios: primera barrera
 * anti-CSRF; la segunda es la comprobación de Origin en csrf.middleware.ts).
 */
import type { CookieOptions, Response } from 'express';
import { env, isProduction } from '../config/env.js';

export const SESSION_COOKIE = 'peluqueria_session';

const UNIDADES: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/** '8h' -> milisegundos (mismo formato que JWT_EXPIRES_IN) */
export function duracionMs(valor: string): number {
  const match = /^(\d+)([smhd])$/.exec(valor);
  if (!match) throw new Error(`Duración no válida: ${valor}`);
  return Number(match[1]) * (UNIDADES[match[2]!] ?? 0);
}

const opciones: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'strict',
  path: '/api',
};

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, { ...opciones, maxAge: duracionMs(env.JWT_EXPIRES_IN) });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, opciones);
}
