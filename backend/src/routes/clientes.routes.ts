import { Router } from 'express';
import { ClientesController } from '../controllers/clientes.controller.js';
import { actualizarClienteSchema, crearClienteSchema, desactivarQuerySchema, listarClientesQuerySchema } from '../dtos/cliente.dto.js';
import { idParamsSchema } from '../dtos/common.dto.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';

const gestion = authorize('admin', 'recepcion');
const admin = authorize('admin');

export const clientesRoutes = Router()
  .use(authenticate)
  .get('/', validate({ query: listarClientesQuerySchema }), ClientesController.listar)
  .post('/', gestion, validate({ body: crearClienteSchema }), ClientesController.crear)
  .get('/:id', validate({ params: idParamsSchema }), ClientesController.obtener)
  .get('/:id/historial', validate({ params: idParamsSchema }), ClientesController.historial)
  .put('/:id', gestion, validate({ params: idParamsSchema, body: actualizarClienteSchema }), ClientesController.actualizar)
  .delete('/:id', admin, validate({ params: idParamsSchema, query: desactivarQuerySchema }), ClientesController.desactivar)
  .post('/:id/reactivar', admin, validate({ params: idParamsSchema }), ClientesController.reactivar)
  // RGPD
  .get('/:id/exportar', admin, validate({ params: idParamsSchema }), ClientesController.exportar)
  .post('/:id/anonimizar', admin, validate({ params: idParamsSchema }), ClientesController.anonimizar);
