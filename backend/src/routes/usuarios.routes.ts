import { Router } from 'express';
import { UsuariosController } from '../controllers/usuarios.controller.js';
import { actualizarUsuarioSchema, crearUsuarioSchema } from '../dtos/auth.dto.js';
import { idParamsSchema } from '../dtos/common.dto.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';

export const usuariosRoutes = Router()
  .use(authenticate, authorize('admin'))
  .get('/', UsuariosController.listar)
  .post('/', validate({ body: crearUsuarioSchema }), UsuariosController.crear)
  .patch('/:id', validate({ params: idParamsSchema, body: actualizarUsuarioSchema }), UsuariosController.actualizar)
  .post('/:id/restablecer-password', validate({ params: idParamsSchema }), UsuariosController.restablecerPassword);
