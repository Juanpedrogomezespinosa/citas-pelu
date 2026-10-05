/**
 * Gestión de usuarios del panel (solo administración).
 *
 * Sin servicio de email, la recuperación de contraseña la hace un admin:
 * genera una contraseña temporal que se muestra UNA vez y que el usuario debe
 * cambiar en su primer acceso (debe_cambiar_password).
 */
import { randomInt } from 'node:crypto';
import { withTransaction } from '../config/database.js';
import type { ActualizarUsuarioDto, CrearUsuarioDto } from '../dtos/auth.dto.js';
import { UsuarioModel, type Usuario } from '../models/usuario.model.js';
import { AppError } from '../utils/app-error.js';
import { AuthService } from './auth.service.js';

const MAYUS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const MINUS = 'abcdefghijkmnopqrstuvwxyz';
const DIGITOS = '23456789';

/** 14 caracteres con mayúscula, minúscula y número (cumple la política); sin caracteres ambiguos */
export function generarPasswordTemporal(): string {
  const todos = MAYUS + MINUS + DIGITOS;
  const pick = (set: string) => set[randomInt(set.length)]!;
  const chars = [pick(MAYUS), pick(MINUS), pick(DIGITOS), ...Array.from({ length: 11 }, () => pick(todos))];
  // Fisher-Yates con aleatoriedad criptográfica
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}

export interface UsuarioConPasswordTemporal {
  usuario: Usuario;
  password_temporal: string;
}

export const UsuarioService = {
  listar(): Promise<Usuario[]> {
    return UsuarioModel.list();
  },

  async crear(dto: CrearUsuarioDto): Promise<UsuarioConPasswordTemporal> {
    const password_temporal = generarPasswordTemporal();
    const id = await UsuarioModel.create({
      ...dto,
      passwordHash: await AuthService.hashPassword(password_temporal),
      debeCambiarPassword: true,
    }); // email duplicado -> 409 por el UNIQUE
    const usuario = await UsuarioModel.findById(id);
    if (!usuario) throw new AppError('No se pudo crear el usuario');
    return { usuario, password_temporal };
  },

  /**
   * Edita nombre, rol o estado. Invariante: siempre queda al menos un
   * administrador activo, y nadie puede quitarse a sí mismo el rol de admin
   * ni desactivarse (evita dejar el sistema sin gestión por accidente).
   */
  async actualizar(id: number, dto: ActualizarUsuarioDto, actorId: number): Promise<Usuario> {
    return withTransaction(async (conn) => {
      const usuario = await UsuarioModel.lockById(id, conn);
      if (!usuario) throw AppError.notFound('Usuario');

      const pierdeAdmin = usuario.rol === 'admin' && usuario.activo && ((dto.rol && dto.rol !== 'admin') || dto.activo === false);
      if (pierdeAdmin) {
        if (id === actorId) throw AppError.conflict('No puedes quitarte el rol de administrador ni desactivarte', 'SELF_LOCKOUT');
        const admins = await UsuarioModel.lockAdminsActivos(conn);
        if (admins.length <= 1) throw AppError.conflict('Debe quedar al menos un administrador activo', 'LAST_ADMIN');
      }

      await UsuarioModel.update(id, dto, conn);
      const actualizado = await UsuarioModel.findById(id, conn);
      if (!actualizado) throw AppError.notFound('Usuario');
      return actualizado;
    });
  },

  /** Restablece la contraseña: temporal + cambio obligatorio + cierre de sus sesiones */
  async restablecerPassword(id: number): Promise<UsuarioConPasswordTemporal> {
    const usuario = await UsuarioModel.findById(id);
    if (!usuario) throw AppError.notFound('Usuario');
    const password_temporal = generarPasswordTemporal();
    await UsuarioModel.setPassword(id, await AuthService.hashPassword(password_temporal), true);
    const actualizado = await UsuarioModel.findById(id);
    return { usuario: actualizado ?? usuario, password_temporal };
  },
} as const;
