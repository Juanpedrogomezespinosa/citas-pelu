import { z } from 'zod';
import { hhmm, optionalEmail, optionalPhone, optionalText, positiveInt, queryBool, requiredText } from './common.dto.js';

const campos = {
  usuario_id: positiveInt.nullable().optional(),
  nombre: requiredText(80),
  apellidos: optionalText(120),
  telefono: optionalPhone,
  email: optionalEmail,
  especialidad: optionalText(150),
  color_calendario: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color hexadecimal (#RRGGBB)'),
  activo: z.boolean(),
};

export const crearEmpleadoSchema = z.object({
  ...campos,
  color_calendario: campos.color_calendario.default('#9F1239'),
  activo: campos.activo.default(true),
});
export type CrearEmpleadoDto = z.infer<typeof crearEmpleadoSchema>;

/** La baja va por DELETE (gestiona las citas pendientes) y el alta por POST /:id/reactivar */
export const actualizarEmpleadoSchema = z
  .object(campos)
  .omit({ activo: true })
  .partial()
  .refine((data) => Object.values(data).some((v) => v !== undefined), 'Indica al menos un campo a modificar');
export type ActualizarEmpleadoDto = z.infer<typeof actualizarEmpleadoSchema>;

export const listarEmpleadosQuerySchema = z.object({
  incluir_inactivos: queryBool.optional(),
});
export type ListarEmpleadosQuery = z.infer<typeof listarEmpleadosQuerySchema>;

const tramoHorario = z
  .object({
    dia_semana: z.number().int().min(0).max(6),
    hora_inicio: hhmm,
    hora_fin: hhmm,
  })
  .refine((t) => t.hora_fin > t.hora_inicio, { message: 'La hora de fin debe ser posterior a la de inicio', path: ['hora_fin'] });

export const reemplazarHorariosSchema = z.object({
  horarios: z
    .array(tramoHorario)
    .max(21)
    .refine((tramos) => !tienenSolapes(tramos), 'Hay tramos que se solapan en el mismo día'),
});
export type ReemplazarHorariosDto = z.infer<typeof reemplazarHorariosSchema>;

function tienenSolapes(tramos: { dia_semana: number; hora_inicio: string; hora_fin: string }[]): boolean {
  const ordenados = [...tramos].sort((a, b) => a.dia_semana - b.dia_semana || a.hora_inicio.localeCompare(b.hora_inicio));
  return ordenados.some((t, i) => {
    const prev = ordenados[i - 1];
    return prev !== undefined && prev.dia_semana === t.dia_semana && t.hora_inicio < prev.hora_fin;
  });
}
