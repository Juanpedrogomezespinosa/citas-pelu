/**
 * Helpers HTTP compartidos por los controladores.
 *
 * Envelope estándar de respuesta:
 *   éxito -> { success: true, data, meta? }
 *   error -> { success: false, error: { message, code, details? } }
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
  meta?: unknown;
}

export function ok<T>(res: Response, data: T, status = 200, meta?: unknown): Response {
  const body: SuccessEnvelope<T> = meta === undefined ? { success: true, data } : { success: true, data, meta };
  return res.status(status).json(body);
}

/**
 * Envuelve una acción de controlador: cualquier error (síncrono o promesa
 * rechazada) se reenvía a `next(error)` para que lo gestione el middleware de
 * errores. Así ninguna acción puede dejar un rechazo sin manejar.
 */
export function action(fn: (req: Request, res: Response) => unknown): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res);
    } catch (error) {
      next(error);
    }
  };
}
