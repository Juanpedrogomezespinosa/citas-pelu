/**
 * Validación en cliente: da feedback inmediato y evita peticiones inútiles.
 * NO sustituye a la del backend (que es la autoridad); replica sus reglas
 * principales con los mismos mensajes.
 */
import type { CitaInput, ClienteInput, FieldErrors } from './types';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[\d\s\-().]{9,20}$/;

export function validarCliente(c: ClienteInput): FieldErrors<ClienteInput> {
  const errors: FieldErrors<ClienteInput> = {};
  if (!c.nombre.trim()) errors.nombre = 'Campo obligatorio';
  else if (c.nombre.length > 80) errors.nombre = 'Máximo 80 caracteres';

  if (!c.telefono.trim()) errors.telefono = 'Campo obligatorio';
  else if (!PHONE.test(c.telefono.trim())) errors.telefono = 'Teléfono no válido';

  if (c.email.trim() && !EMAIL.test(c.email.trim())) errors.email = 'Email no válido';

  if (c.fecha_nacimiento && new Date(c.fecha_nacimiento) > new Date()) {
    errors.fecha_nacimiento = 'No puede ser una fecha futura';
  }
  if (c.alergias.length > 500) errors.alergias = 'Máximo 500 caracteres';
  if (c.notas.length > 2000) errors.notas = 'Máximo 2000 caracteres';
  return errors;
}

export interface CitaDraft extends Omit<CitaInput, 'cliente_id' | 'empleado_id' | 'fecha_inicio'> {
  cliente_id: number | null;
  empleado_id: number | null;
  fecha: string; // 'YYYY-MM-DD'
  hora: string; // 'HH:mm'
}

export function validarCita(c: CitaDraft): FieldErrors<CitaDraft> {
  const errors: FieldErrors<CitaDraft> = {};
  if (!c.cliente_id) errors.cliente_id = 'Selecciona un cliente';
  if (!c.empleado_id) errors.empleado_id = 'Selecciona un profesional';
  if (c.servicios.length === 0) errors.servicios = 'Selecciona al menos un servicio';
  if (!c.fecha) errors.fecha = 'Selecciona una fecha';
  if (!c.hora) errors.hora = 'Selecciona una hora disponible';
  if (c.notas.length > 1000) errors.notas = 'Máximo 1000 caracteres';
  return errors;
}

export const hayErrores = (errors: object): boolean => Object.keys(errors).length > 0;
