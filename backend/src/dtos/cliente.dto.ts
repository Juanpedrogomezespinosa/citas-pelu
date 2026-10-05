import { z } from 'zod';
import { SENSIBILIDADES, TIPOS_CABELLO } from '../models/cliente.model.js';
import { optionalDate, optionalEmail, optionalText, paginationShape, phoneField, queryBool, requiredText } from './common.dto.js';

/*
 * Los campos se definen SIN `.default()`: en zod 4 los defaults se aplican
 * también dentro de `.partial()`, y en una actualización parcial un default
 * sobrescribiría datos existentes. Los defaults se añaden solo al crear.
 */
const campos = {
  nombre: requiredText(80),
  apellidos: optionalText(120),
  telefono: phoneField,
  email: optionalEmail,
  fecha_nacimiento: optionalDate,
  acepta_whatsapp: z.boolean(),
  tipo_cabello: z.enum(TIPOS_CABELLO).nullable().optional(),
  color_preferido: optionalText(100),
  tipo_corte_preferido: optionalText(120),
  sensibilidad_cuero_cabelludo: z.enum(SENSIBILIDADES),
  alergias: optionalText(500),
  productos_preferidos: optionalText(500),
  notas: optionalText(2000),
};

export const crearClienteSchema = z.object({
  ...campos,
  acepta_whatsapp: campos.acepta_whatsapp.default(true),
  sensibilidad_cuero_cabelludo: campos.sensibilidad_cuero_cabelludo.default('ninguna'),
});
export type CrearClienteDto = z.infer<typeof crearClienteSchema>;

export const actualizarClienteSchema = z
  .object(campos)
  .partial()
  .refine((data) => Object.values(data).some((v) => v !== undefined), 'Indica al menos un campo a modificar');
export type ActualizarClienteDto = z.infer<typeof actualizarClienteSchema>;

export const listarClientesQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  incluir_inactivos: queryBool.optional(),
  ...paginationShape,
});
export type ListarClientesQuery = z.infer<typeof listarClientesQuerySchema>;

export const desactivarQuerySchema = z.object({
  /** true: cancela (avisando por WhatsApp) las citas futuras en la misma operación */
  cancelar_citas: queryBool.optional(),
});
export type DesactivarQuery = z.infer<typeof desactivarQuerySchema>;
