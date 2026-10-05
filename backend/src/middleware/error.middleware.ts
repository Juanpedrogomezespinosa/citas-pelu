/**
 * Manejo centralizado de errores: todo error llega aquí vía next(error) y se
 * traduce al envelope { success: false, error: { message, code, details? } }.
 */
import type { NextFunction, Request, Response } from 'express';
import { isProduction } from '../config/env.js';
import { AppError } from '../utils/app-error.js';
import { logger } from '../utils/logger.js';

interface MysqlError {
  code?: string;
  sqlMessage?: string;
}

interface BodyParserError {
  type?: string;
}

export function notFound(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(`Ruta no encontrada: ${req.method} ${req.path}`, 404, 'ROUTE_NOT_FOUND'));
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const error = toAppError(err);

  if (error.statusCode >= 500) {
    logger.error(err instanceof Error ? err.message : String(err), {
      method: req.method,
      path: req.path, // sin query string: puede contener datos personales
      stack: err instanceof Error ? err.stack : undefined,
    });
  }

  res.status(error.statusCode).json({
    success: false,
    error: {
      message: error.message,
      code: error.code,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  });
}

/** Traduce errores conocidos (MySQL, body-parser) a AppError */
function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  const { type } = (err ?? {}) as BodyParserError;
  if (type === 'entity.parse.failed') return AppError.badRequest('El cuerpo no es JSON válido', 'INVALID_JSON');
  if (type === 'entity.too.large') return new AppError('El cuerpo de la petición es demasiado grande', 413, 'PAYLOAD_TOO_LARGE');

  const { code, sqlMessage = '' } = (err ?? {}) as MysqlError;
  switch (code) {
    case 'ER_DUP_ENTRY':
      return AppError.conflict(duplicateMessage(sqlMessage), 'DUPLICATE');
    case 'ER_NO_REFERENCED_ROW_2':
      return AppError.badRequest('Alguna referencia (cliente, empleado, servicio...) no existe', 'INVALID_REFERENCE');
    case 'ER_ROW_IS_REFERENCED_2':
      return AppError.conflict('No se puede eliminar: hay registros que dependen de este', 'IN_USE');
    case 'ER_CHECK_CONSTRAINT_VIOLATED':
      return AppError.badRequest('Los datos no cumplen las reglas de integridad', 'CONSTRAINT_VIOLATION');
    case 'ER_LOCK_DEADLOCK':
    case 'ER_LOCK_WAIT_TIMEOUT':
      return new AppError('El sistema está ocupado, inténtalo de nuevo', 503, 'TRY_AGAIN');
    default:
      // Nunca exponer detalles internos (SQL, rutas, stack) en producción
      return new AppError(
        isProduction ? 'Error interno del servidor' : err instanceof Error ? err.message : 'Error interno',
        500,
        'INTERNAL_ERROR',
      );
  }
}

function duplicateMessage(sqlMessage: string): string {
  if (sqlMessage.includes('telefono')) return 'Ya existe un registro con ese teléfono';
  if (sqlMessage.includes('email')) return 'Ya existe un registro con ese email';
  if (sqlMessage.includes('nombre')) return 'Ya existe un registro con ese nombre';
  return 'El registro ya existe';
}
