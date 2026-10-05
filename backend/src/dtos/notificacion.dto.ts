import { z } from 'zod';
import { ESTADOS_NOTIFICACION, TIPOS_NOTIFICACION } from '../models/notificacion.model.js';
import { paginationShape, positiveInt, requiredText } from './common.dto.js';

export const listarNotificacionesQuerySchema = z.object({
  cita_id: positiveInt.optional(),
  cliente_id: positiveInt.optional(),
  estado: z.enum(ESTADOS_NOTIFICACION).optional(),
  tipo: z.enum(TIPOS_NOTIFICACION).optional(),
  ...paginationShape,
});
export type ListarNotificacionesQuery = z.infer<typeof listarNotificacionesQuerySchema>;

/** Solo en desarrollo: simula un mensaje entrante de WhatsApp sin proveedor real */
export const simularMensajeSchema = z.object({
  telefono: z.string().min(6).max(30),
  mensaje: requiredText(1000),
});
export type SimularMensajeDto = z.infer<typeof simularMensajeSchema>;
