import { Router } from 'express';
import { BloqueosController } from '../controllers/bloqueos.controller.js';
import { crearBloqueoSchema, listarBloqueosQuerySchema } from '../dtos/bloqueo.dto.js';
import { idParamsSchema } from '../dtos/common.dto.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';

export const bloqueosRoutes = Router()
  .use(authenticate)
  .get('/', validate({ query: listarBloqueosQuerySchema }), BloqueosController.listar)
  .post('/', authorize('admin', 'recepcion'), validate({ body: crearBloqueoSchema }), BloqueosController.crear)
  .delete('/:id', authorize('admin', 'recepcion'), validate({ params: idParamsSchema }), BloqueosController.eliminar);
