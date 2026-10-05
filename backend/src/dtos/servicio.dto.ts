import { z } from 'zod';
import { CATEGORIAS_SERVICIO } from '../models/servicio.model.js';
import { optionalText, queryBool, requiredText } from './common.dto.js';

const campos = {
  nombre: requiredText(100),
  descripcion: optionalText(500),
  categoria: z.enum(CATEGORIAS_SERVICIO),
  duracion_minutos: z.coerce.number().int().min(5, 'Mínimo 5 minutos').max(600, 'Máximo 10 horas'),
  precio: z.coerce
    .number()
    .min(0, 'El precio no puede ser negativo')
    .max(99999.99)
    .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'Máximo 2 decimales'),
  activo: z.boolean(),
};

export const crearServicioSchema = z.object({
  ...campos,
  categoria: campos.categoria.default('otros'),
  activo: campos.activo.default(true),
});
export type CrearServicioDto = z.infer<typeof crearServicioSchema>;

export const actualizarServicioSchema = z
  .object(campos)
  .partial()
  .refine((data) => Object.values(data).some((v) => v !== undefined), 'Indica al menos un campo a modificar');
export type ActualizarServicioDto = z.infer<typeof actualizarServicioSchema>;

export const listarServiciosQuerySchema = z.object({
  incluir_inactivos: queryBool.optional(),
});
export type ListarServiciosQuery = z.infer<typeof listarServiciosQuerySchema>;
