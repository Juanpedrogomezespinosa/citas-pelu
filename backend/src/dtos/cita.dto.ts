import { z } from 'zod';
import { ESTADOS_CITA } from '../models/cita.model.js';
import { dateString, localDateTime, optionalText, paginationShape, positiveInt } from './common.dto.js';

const listaServicios = z
  .array(positiveInt)
  .min(1, 'Selecciona al menos un servicio')
  .max(10, 'Máximo 10 servicios por cita')
  .refine((ids) => new Set(ids).size === ids.length, 'Hay servicios repetidos');

export const crearCitaSchema = z.object({
  cliente_id: positiveInt,
  empleado_id: positiveInt,
  /** Hora local del salón: 'YYYY-MM-DDTHH:mm' */
  fecha_inicio: localDateTime,
  servicios: listaServicios,
  notas: optionalText(1000),
});
export type CrearCitaDto = z.infer<typeof crearCitaSchema>;

export const actualizarCitaSchema = z
  .object({
    /** Bloqueo optimista: versión que el cliente leyó antes de editar */
    version: positiveInt,
    empleado_id: positiveInt.optional(),
    fecha_inicio: localDateTime.optional(),
    servicios: listaServicios.optional(),
    notas: optionalText(1000),
  })
  .refine(
    ({ version: _version, ...cambios }) => Object.values(cambios).some((v) => v !== undefined),
    'Indica al menos un campo a modificar',
  );
export type ActualizarCitaDto = z.infer<typeof actualizarCitaSchema>;

/** Transiciones manuales (la cancelación tiene su propio endpoint con motivo) */
export const cambiarEstadoSchema = z.object({
  estado: z.enum(['confirmada', 'completada', 'no_asistio']),
});
export type CambiarEstadoDto = z.infer<typeof cambiarEstadoSchema>;

const notasTecnicas = z
  .array(z.object({ servicio_id: positiveInt, notas: optionalText(500).transform((v) => v ?? null) }))
  .max(10)
  .refine((n) => new Set(n.map((x) => x.servicio_id)).size === n.length, 'Hay servicios repetidos');

/** Completar la cita registrando la ficha técnica de cada servicio */
export const completarCitaSchema = z.object({ notas_tecnicas: notasTecnicas.default([]) });
export type CompletarCitaDto = z.infer<typeof completarCitaSchema>;

export const notasTecnicasSchema = z.object({ notas_tecnicas: notasTecnicas.min(1) });
export type NotasTecnicasDto = z.infer<typeof notasTecnicasSchema>;

export const cancelarCitaSchema = z.object({
  motivo: optionalText(500),
});
export type CancelarCitaDto = z.infer<typeof cancelarCitaSchema>;

export const listarCitasQuerySchema = z
  .object({
    desde: dateString.optional(),
    hasta: dateString.optional(),
    estado: z.enum(ESTADOS_CITA).optional(),
    empleado_id: positiveInt.optional(),
    cliente_id: positiveInt.optional(),
    q: z.string().trim().max(100).optional(),
    orden: z.enum(['asc', 'desc']).default('asc'),
    ...paginationShape,
  })
  .refine((q) => !q.desde || !q.hasta || q.desde <= q.hasta, { message: '"desde" debe ser anterior a "hasta"', path: ['hasta'] });
export type ListarCitasQuery = z.infer<typeof listarCitasQuerySchema>;

export const disponibilidadQuerySchema = z.object({
  empleado_id: positiveInt,
  fecha: dateString,
  duracion: z.coerce.number().int().min(5).max(600),
  /** Al reprogramar, la propia cita no debe contar como ocupada */
  excluir_cita_id: positiveInt.optional(),
});
export type DisponibilidadQuery = z.infer<typeof disponibilidadQuerySchema>;
