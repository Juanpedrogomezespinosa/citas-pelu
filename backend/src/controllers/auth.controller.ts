/**
 * Controladores: solo traducen HTTP <-> servicio.
 *  - Leen entradas de req.validatedBody / validatedQuery / validatedParams.
 *  - Responden con el envelope { success: true, data }.
 *  - `action()` reenvía cualquier error a next(error).
 *
 * El token de sesión NUNCA va en el cuerpo de la respuesta: solo en la cookie
 * httpOnly, para que el JavaScript del navegador no pueda leerlo.
 */
import type { CambiarPasswordDto, LoginDto } from '../dtos/auth.dto.js';
import { AuthService } from '../services/auth.service.js';
import { AppError } from '../utils/app-error.js';
import { action, ok } from '../utils/http.js';
import { clearSessionCookie, setSessionCookie } from '../utils/session-cookie.js';

export const AuthController = {
  login: action(async (req, res) => {
    const { token, usuario } = await AuthService.login(req.validatedBody as LoginDto);
    setSessionCookie(res, token);
    ok(res, usuario);
  }),

  logout: action((_req, res) => {
    clearSessionCookie(res);
    res.status(204).end();
  }),

  /** Cierra la sesión en todos los dispositivos */
  logoutTodas: action(async (req, res) => {
    if (!req.user) throw AppError.unauthorized();
    await AuthService.revocarSesiones(req.user.id);
    clearSessionCookie(res);
    res.status(204).end();
  }),

  me: action(async (req, res) => {
    if (!req.user) throw AppError.unauthorized();
    ok(res, await AuthService.me(req.user.id));
  }),

  cambiarPassword: action(async (req, res) => {
    if (!req.user) throw AppError.unauthorized();
    const { token, usuario } = await AuthService.cambiarPassword(req.user.id, req.validatedBody as CambiarPasswordDto);
    setSessionCookie(res, token);
    ok(res, usuario);
  }),
} as const;
