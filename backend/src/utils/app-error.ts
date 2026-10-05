/**
 * Error de dominio con código HTTP y un código interno estable que el frontend
 * puede interpretar (p. ej. 'SLOT_UNAVAILABLE'). Los servicios lanzan AppError
 * sin conocer Express; el middleware de errores lo traduce a la respuesta.
 */
export class AppError extends Error {
  override readonly name = 'AppError';

  constructor(
    message: string,
    readonly statusCode = 500,
    readonly code = 'INTERNAL_ERROR',
    readonly details?: unknown,
  ) {
    super(message);
  }

  static badRequest(message: string, code = 'BAD_REQUEST', details?: unknown): AppError {
    return new AppError(message, 400, code, details);
  }

  static unauthorized(message = 'No autenticado'): AppError {
    return new AppError(message, 401, 'UNAUTHORIZED');
  }

  static forbidden(message = 'No tienes permisos para esta acción'): AppError {
    return new AppError(message, 403, 'FORBIDDEN');
  }

  static notFound(resource = 'Recurso'): AppError {
    return new AppError(`${resource} no encontrado`, 404, 'NOT_FOUND');
  }

  static conflict(message: string, code = 'CONFLICT'): AppError {
    return new AppError(message, 409, code);
  }
}
