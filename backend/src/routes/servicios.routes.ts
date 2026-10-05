import { Router } from 'express';
import { ServiciosController } from '../controllers/servicios.controller.js';
import { idParamsSchema } from '../dtos/common.dto.js';
import { actualizarServicioSchema, crearServicioSchema, listarServiciosQuerySchema } from '../dtos/servicio.dto.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';

export const serviciosRoutes = Router()
  .use(authenticate)
  .get('/', validate({ query: listarServiciosQuerySchema }), ServiciosController.listar)
  .get('/:id', validate({ params: idParamsSchema }), ServiciosController.obtener)
  // Solo administración modifica el catálogo y las tarifas
  .post('/', authorize('admin'), validate({ body: crearServicioSchema }), ServiciosController.crear)
  .put('/:id', authorize('admin'), validate({ params: idParamsSchema, body: actualizarServicioSchema }), ServiciosController.actualizar)
  .delete('/:id', authorize('admin'), validate({ params: idParamsSchema }), ServiciosController.desactivar);
