/**
 * Protección CSRF para la sesión por cookie.
 *
 * SameSite=Strict ya impide que otro sitio envíe la cookie, pero como defensa
 * en profundidad las peticiones que modifican datos y llevan la cookie de
 * sesión deben venir de un origen permitido (cabecera Origin, o Referer si el
 * navegador no envía Origin). Las peticiones sin cookie (webhooks, clientes
 * de API con Bearer) no son vulnerables a CSRF y no se ven afectadas.
 */
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { AppError } from '../utils/app-error.js';
import { SESSION_COOKIE } from '../utils/session-cookie.js';

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function crearCsrfGuard(origenesPermitidos: ReadonlySet<string>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    if (METODOS_SEGUROS.has(req.method) || !cookies?.[SESSION_COOKIE]) {
      next();
      return;
    }

    const origen = req.get('origin') ?? origenDeReferer(req.get('referer'));
    // Mismo origen que la API (frontend servido detrás del mismo dominio/proxy)
    const propio = new URL(env.PUBLIC_BASE_URL).origin;

    if (origen && (origenesPermitidos.has(origen) || origen === propio)) {
      next();
      return;
    }
    next(AppError.forbidden('Origen de la petición no permitido'));
  };
}

function origenDeReferer(referer: string | undefined): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}
