/**
 * Sesión del panel.
 *
 * El token de sesión vive en una cookie httpOnly que JavaScript NO puede leer
 * (un XSS no puede robarlo). Aquí solo se guarda en localStorage una "pista"
 * no sensible con el nombre y el rol del usuario, para pintar el menú sin
 * esperar a la API. La autoridad es siempre GET /api/auth/me.
 */
import type { Rol, Usuario } from './types';

const USER_KEY = 'peluqueria.usuario';
const API_URL = (import.meta.env.PUBLIC_API_URL ?? '/api').replace(/\/$/, '');

export function getUsuario(): Usuario | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as Usuario) : null;
  } catch {
    return null;
  }
}

export function guardarUsuario(usuario: Usuario): void {
  window.localStorage.setItem(USER_KEY, JSON.stringify(usuario));
}

export function olvidarUsuario(): void {
  window.localStorage.removeItem(USER_KEY);
}

export async function cerrarSesion(): Promise<void> {
  await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => undefined);
  olvidarUsuario();
  window.location.assign('/login');
}

export const tieneRol = (usuario: Usuario | null, ...roles: Rol[]): boolean => Boolean(usuario && roles.includes(usuario.rol));
