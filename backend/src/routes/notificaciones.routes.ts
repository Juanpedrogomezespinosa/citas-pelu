import { Router } from 'express';
import { NotificacionesController } from '../controllers/notificaciones.controller.js';
import { idParamsSchema } from '../dtos/common.dto.js';
import { listarNotificacionesQuerySchema } from '../dtos/notificacion.dto.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';

export const notificacionesRoutes = Router()
  .use(authenticate, authorize('admin', 'recepcion'))
  .get('/', validate({ query: listarNotificacionesQuerySchema }), NotificacionesController.listar)
  .get('/:id', validate({ params: idParamsSchema }), NotificacionesController.obtener)
  .post('/:id/reintentar', validate({ params: idParamsSchema }), NotificacionesController.reintentar);
