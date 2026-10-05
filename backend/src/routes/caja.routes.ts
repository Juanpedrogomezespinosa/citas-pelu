import { Router } from 'express';
import { CobrosController, ProductosController } from '../controllers/caja.controller.js';
import {
  actualizarProductoSchema,
  anularCobroSchema,
  crearCobroSchema,
  crearProductoSchema,
  listarProductosQuerySchema,
  rangoFechasQuerySchema,
} from '../dtos/caja.dto.js';
import { idParamsSchema } from '../dtos/common.dto.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';

/*
 * Caja: recepción cobra; anular cobros, gestionar productos e informes es de administración.
 */
const caja = authorize('admin', 'recepcion');
const admin = authorize('admin');

export const productosRoutes = Router()
  .use(authenticate, caja)
  .get('/', validate({ query: listarProductosQuerySchema }), ProductosController.listar)
  .post('/', admin, validate({ body: crearProductoSchema }), ProductosController.crear)
  .put('/:id', admin, validate({ params: idParamsSchema, body: actualizarProductoSchema }), ProductosController.actualizar);

export const cobrosRoutes = Router()
  .use(authenticate, caja)
  .get('/', validate({ query: rangoFechasQuerySchema }), CobrosController.listar)
  .post('/', validate({ body: crearCobroSchema }), CobrosController.crear)
  .get('/:id', validate({ params: idParamsSchema }), CobrosController.obtener)
  .post('/:id/anular', admin, validate({ params: idParamsSchema, body: anularCobroSchema }), CobrosController.anular);

export const informesRoutes = Router()
  .use(authenticate, admin)
  .get('/caja', validate({ query: rangoFechasQuerySchema }), CobrosController.informe);
