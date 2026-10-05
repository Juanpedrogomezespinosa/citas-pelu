import type { ActualizarUsuarioDto, CrearUsuarioDto } from '../dtos/auth.dto.js';
import type { IdParams } from '../dtos/common.dto.js';
import { publico } from '../services/auth.service.js';
import { UsuarioService } from '../services/usuario.service.js';
import { AppError } from '../utils/app-error.js';
import { action, ok } from '../utils/http.js';

export const UsuariosController = {
  listar: action(async (_req, res) => {
    const usuarios = await UsuarioService.listar();
    ok(
      res,
      usuarios.map((u) => ({ ...publico(u), activo: u.activo, ultimo_acceso: u.ultimo_acceso })),
    );
  }),

  crear: action(async (req, res) => {
    const { usuario, password_temporal } = await UsuarioService.crear(req.validatedBody as CrearUsuarioDto);
    // La contraseña temporal se devuelve UNA sola vez y no queda registrada
    res.setHeader('Cache-Control', 'no-store');
    ok(res, { usuario: publico(usuario), password_temporal }, 201);
  }),

  actualizar: action(async (req, res) => {
    if (!req.user) throw AppError.unauthorized();
    const { id } = req.validatedParams as IdParams;
    const usuario = await UsuarioService.actualizar(id, req.validatedBody as ActualizarUsuarioDto, req.user.id);
    ok(res, { ...publico(usuario), activo: usuario.activo });
  }),

  restablecerPassword: action(async (req, res) => {
    const { id } = req.validatedParams as IdParams;
    const { usuario, password_temporal } = await UsuarioService.restablecerPassword(id);
    res.setHeader('Cache-Control', 'no-store');
    ok(res, { usuario: publico(usuario), password_temporal });
  }),
} as const;
