import { Router } from 'express';
import { EmpleadosController } from '../controllers/empleados.controller.js';
import { desactivarQuerySchema } from '../dtos/cliente.dto.js';
import { idParamsSchema } from '../dtos/common.dto.js';
import {
  actualizarEmpleadoSchema,
  crearEmpleadoSchema,
  listarEmpleadosQuerySchema,
  reemplazarHorariosSchema,
} from '../dtos/empleado.dto.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';

export const empleadosRoutes = Router()
  .use(authenticate)
  .get('/', validate({ query: listarEmpleadosQuerySchema }), EmpleadosController.listar)
  .get('/:id', validate({ params: idParamsSchema }), EmpleadosController.obtener)
  .post('/', authorize('admin'), validate({ body: crearEmpleadoSchema }), EmpleadosController.crear)
  .put('/:id', authorize('admin'), validate({ params: idParamsSchema, body: actualizarEmpleadoSchema }), EmpleadosController.actualizar)
  .put(
    '/:id/horarios',
    authorize('admin'),
    validate({ params: idParamsSchema, body: reemplazarHorariosSchema }),
    EmpleadosController.reemplazarHorarios,
  )
  .post('/:id/reactivar', authorize('admin'), validate({ params: idParamsSchema }), EmpleadosController.reactivar)
  .delete('/:id', authorize('admin'), validate({ params: idParamsSchema, query: desactivarQuerySchema }), EmpleadosController.desactivar);
