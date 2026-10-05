/**
 * Validación de entradas con esquemas zod (DTOs).
 *
 *   router.post('/', validate({ body: crearClienteSchema }), ClientesController.crear)
 *
 * Los datos validados y transformados (trim, teléfono E.164, '' -> null,
 * coerción numérica...) quedan en req.validatedBody / validatedQuery /
 * validatedParams. Los controladores SOLO leen de ahí, nunca de req.body, así
 * es imposible usar por error un campo sin validar.
 */
import type { NextFunction, Request, Response } from 'express';
import type { ZodError, ZodType } from 'zod';
import { AppError } from '../utils/app-error.js';

interface Schemas {
  params?: ZodType;
  query?: ZodType;
  body?: ZodType;
}

const TARGET = { params: 'validatedParams', query: 'validatedQuery', body: 'validatedBody' } as const;

export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    for (const source of ['params', 'query', 'body'] as const) {
      const schema = schemas[source];
      if (!schema) continue;

      const result = schema.safeParse(req[source] ?? {});
      if (!result.success) {
        next(AppError.badRequest('Datos de entrada no válidos', 'VALIDATION_ERROR', formatIssues(result.error)));
        return;
      }
      req[TARGET[source]] = result.data;
    }
    next();
  };
}

/** { fields: { campo: mensaje } } — el frontend lo pinta junto a cada input */
export function formatIssues(error: ZodError): { fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  return { fields };
}
