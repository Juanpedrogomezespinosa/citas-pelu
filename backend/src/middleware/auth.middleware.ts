/**
 * Autenticación (JWT en cookie httpOnly, o Bearer para clientes de API y
 * tests) y autorización por roles.
 */
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UsuarioModel, type Rol } from '../models/usuario.model.js';
import { AppError } from '../utils/app-error.js';
import { SESSION_COOKIE } from '../utils/session-cookie.js';

interface TokenPayload {
  sub: number;
  /** token_version del usuario al emitir el token */
  tv: number;
}

function leerToken(req: Request): string | null {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  const cookie = cookies?.[SESSION_COOKIE];
  if (cookie) return cookie;
  const [scheme, token] = (req.get('authorization') ?? '').split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

function verifyToken(token: string): TokenPayload {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || typeof payload.sub !== 'string') throw new Error('payload');
    return { sub: Number(payload.sub), tv: Number(payload['tv']) };
  } catch {
    throw AppError.unauthorized('Sesión no válida o caducada');
  }
}

export function signToken(usuario: { id: number; rol: Rol; token_version: number }): string {
  return jwt.sign({ rol: usuario.rol, tv: usuario.token_version }, env.JWT_SECRET, {
    algorithm: 'HS256',
    subject: String(usuario.id),
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] & string,
  });
}

function crearAuthenticate({ permitirCambioPendiente }: { permitirCambioPendiente: boolean }) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = leerToken(req);
      if (!token) throw AppError.unauthorized('No has iniciado sesión');

      const { sub, tv } = verifyToken(token);

      // En cada petición se comprueba en BD que el usuario sigue activo y que
      // el token no ha sido revocado (cambio de contraseña, de rol, baja...)
      const usuario = await UsuarioModel.findById(sub);
      if (!usuario?.activo || usuario.token_version !== tv) throw AppError.unauthorized('Sesión no válida o caducada');

      if (usuario.debe_cambiar_password && !permitirCambioPendiente) {
        throw new AppError('Debes cambiar tu contraseña antes de continuar', 403, 'PASSWORD_CHANGE_REQUIRED');
      }

      req.user = { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol };
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Exige sesión válida y contraseña ya cambiada */
export const authenticate = crearAuthenticate({ permitirCambioPendiente: false });

/** Solo para /auth/me, /auth/password y /auth/logout: accesibles con cambio de contraseña pendiente */
export const authenticateAllowPasswordChange = crearAuthenticate({ permitirCambioPendiente: true });

/** Restringe una ruta a ciertos roles. Usar SIEMPRE después de `authenticate`. */
export function authorize(...roles: Rol[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    next(req.user && roles.includes(req.user.rol) ? undefined : AppError.forbidden());
  };
}
