import bcrypt from 'bcryptjs';
import type { CambiarPasswordDto, LoginDto } from '../dtos/auth.dto.js';
import { signToken } from '../middleware/auth.middleware.js';
import { UsuarioModel, type Usuario } from '../models/usuario.model.js';
import { AppError } from '../utils/app-error.js';

const BCRYPT_ROUNDS = 12;

/*
 * Hash ficticio para igualar el tiempo de respuesta cuando el email no existe:
 * sin él, midiendo cuánto tarda el login se podría averiguar qué emails existen.
 */
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_ROUNDS);

export type UsuarioPublico = Pick<Usuario, 'id' | 'nombre' | 'email' | 'rol' | 'debe_cambiar_password'>;

export interface Sesion {
  token: string;
  usuario: UsuarioPublico;
}

export const publico = (u: Usuario): UsuarioPublico => ({
  id: u.id,
  nombre: u.nombre,
  email: u.email,
  rol: u.rol,
  debe_cambiar_password: u.debe_cambiar_password,
});

export const AuthService = {
  async login({ email, password }: LoginDto): Promise<Sesion> {
    const usuario = await UsuarioModel.findByEmailWithPassword(email);
    const valid = await bcrypt.compare(password, usuario?.password_hash ?? DUMMY_HASH);

    if (!usuario || !valid || !usuario.activo) {
      // Mensaje genérico: no revelar si falló el email o la contraseña
      throw AppError.unauthorized('Credenciales incorrectas');
    }
    await UsuarioModel.touchLastLogin(usuario.id, new Date());
    return { token: signToken(usuario), usuario: publico(usuario) };
  },

  async me(id: number): Promise<UsuarioPublico> {
    const usuario = await UsuarioModel.findById(id);
    if (!usuario) throw AppError.unauthorized();
    return publico(usuario);
  },

  /**
   * Cambio de la propia contraseña. Revoca el resto de sesiones del usuario
   * (token_version + 1) y devuelve un token nuevo para la sesión actual.
   */
  async cambiarPassword(id: number, dto: CambiarPasswordDto): Promise<Sesion> {
    const usuario = await UsuarioModel.findByIdWithPassword(id);
    if (!usuario || !(await bcrypt.compare(dto.actual, usuario.password_hash))) {
      throw AppError.badRequest('La contraseña actual no es correcta', 'VALIDATION_ERROR', {
        fields: { actual: 'La contraseña actual no es correcta' },
      });
    }
    await UsuarioModel.setPassword(id, await this.hashPassword(dto.nueva), false);

    const actualizado = await UsuarioModel.findById(id);
    if (!actualizado) throw AppError.unauthorized();
    return { token: signToken(actualizado), usuario: publico(actualizado) };
  },

  /** Cierra la sesión en todos los dispositivos */
  revocarSesiones(id: number): Promise<void> {
    return UsuarioModel.revocarSesiones(id);
  },

  hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  },
} as const;
