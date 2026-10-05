import { Router } from 'express';
import { CitasController } from '../controllers/citas.controller.js';
import {
  actualizarCitaSchema,
  cambiarEstadoSchema,
  cancelarCitaSchema,
  completarCitaSchema,
  crearCitaSchema,
  disponibilidadQuerySchema,
  listarCitasQuerySchema,
  notasTecnicasSchema,
} from '../dtos/cita.dto.js';
import { idParamsSchema } from '../dtos/common.dto.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';

/*
 * Permisos:
 *  - Todo el personal ve la agenda y registra la atención (confirmar, completar, notas técnicas).
 *  - Reservar, reprogramar, cancelar y enviar recordatorios: recepción y administración.
 */
const gestion = authorize('admin', 'recepcion');

export const citasRoutes = Router()
  .use(authenticate)
  .get('/', validate({ query: listarCitasQuerySchema }), CitasController.listar)
  // Antes de '/:id' para que "disponibilidad" no se interprete como un id
  .get('/disponibilidad', validate({ query: disponibilidadQuerySchema }), CitasController.disponibilidad)
  .post('/', gestion, validate({ body: crearCitaSchema }), CitasController.crear)
  .get('/:id', validate({ params: idParamsSchema }), CitasController.obtener)
  .patch('/:id', gestion, validate({ params: idParamsSchema, body: actualizarCitaSchema }), CitasController.actualizar)
  .patch('/:id/estado', validate({ params: idParamsSchema, body: cambiarEstadoSchema }), CitasController.cambiarEstado)
  .post('/:id/completar', validate({ params: idParamsSchema, body: completarCitaSchema }), CitasController.completar)
  .put('/:id/notas-tecnicas', validate({ params: idParamsSchema, body: notasTecnicasSchema }), CitasController.actualizarNotasTecnicas)
  .post('/:id/cancelar', gestion, validate({ params: idParamsSchema, body: cancelarCitaSchema }), CitasController.cancelar)
  .post('/:id/recordatorio', gestion, validate({ params: idParamsSchema }), CitasController.enviarRecordatorio);
