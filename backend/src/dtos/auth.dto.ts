import { z } from 'zod';
import { ROLES } from '../models/usuario.model.js';
import { requiredText } from './common.dto.js';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Email no válido')),
  password: z.string().min(1, 'Introduce la contraseña').max(128),
});
export type LoginDto = z.infer<typeof loginSchema>;

export const passwordPolicy = z
  .string()
  .min(10, 'Mínimo 10 caracteres')
  .max(128)
  .regex(/[A-Z]/, 'Debe incluir una mayúscula')
  .regex(/[a-z]/, 'Debe incluir una minúscula')
  .regex(/\d/, 'Debe incluir un número');

export const cambiarPasswordSchema = z
  .object({
    actual: z.string().min(1, 'Introduce tu contraseña actual').max(128),
    nueva: passwordPolicy,
  })
  .refine((d) => d.actual !== d.nueva, { message: 'La nueva contraseña debe ser distinta', path: ['nueva'] });
export type CambiarPasswordDto = z.infer<typeof cambiarPasswordSchema>;

/** Alta de usuario: la contraseña inicial la genera el sistema y se cambia en el primer acceso */
export const crearUsuarioSchema = z.object({
  nombre: requiredText(100),
  email: z.string().trim().toLowerCase().pipe(z.email('Email no válido').max(150)),
  rol: z.enum(ROLES),
});
export type CrearUsuarioDto = z.infer<typeof crearUsuarioSchema>;

export const actualizarUsuarioSchema = z
  .object({
    nombre: requiredText(100).optional(),
    rol: z.enum(ROLES).optional(),
    activo: z.boolean().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), 'Indica al menos un campo a modificar');
export type ActualizarUsuarioDto = z.infer<typeof actualizarUsuarioSchema>;
