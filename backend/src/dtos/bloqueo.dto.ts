import { z } from 'zod';
import { TIPOS_BLOQUEO } from '../models/bloqueo.model.js';
import { dateString, localDateTime, optionalText, positiveInt } from './common.dto.js';

export const crearBloqueoSchema = z.object({
  /** Sin empleado: afecta a todo el local (festivo) */
  empleado_id: positiveInt.nullable().optional(),
  tipo: z.enum(TIPOS_BLOQUEO),
  fecha_inicio: localDateTime,
  fecha_fin: localDateTime,
  motivo: optionalText(200),
});
export type CrearBloqueoDto = z.infer<typeof crearBloqueoSchema>;

export const listarBloqueosQuerySchema = z
  .object({
    desde: dateString,
    hasta: dateString,
    empleado_id: positiveInt.optional(),
  })
  .refine((q) => q.desde <= q.hasta, { message: '"desde" debe ser anterior a "hasta"', path: ['hasta'] });
export type ListarBloqueosQuery = z.infer<typeof listarBloqueosQuerySchema>;
