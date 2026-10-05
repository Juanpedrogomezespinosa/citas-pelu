import { createContext, useContext, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { guardarUsuario, olvidarUsuario } from '../lib/session';
import type { Usuario } from '../lib/types';

/** Una sola llamada a /auth/me por carga de página, compartida por todas las islas */
let peticionMe: Promise<Usuario> | null = null;
const obtenerUsuario = () => (peticionMe ??= api.auth.me());

export type EstadoSesion = { estado: 'cargando' } | { estado: 'lista'; usuario: Usuario };

/**
 * Valida la sesión contra la API (la cookie httpOnly no es legible desde JS).
 * Sin sesión -> login. Con cambio de contraseña pendiente -> /cuenta.
 */
export function useValidarSesion(): EstadoSesion {
  const [sesion, setSesion] = useState<EstadoSesion>({ estado: 'cargando' });

  useEffect(() => {
    let vigente = true;
    obtenerUsuario()
      .then((usuario) => {
        if (!vigente) return;
        guardarUsuario(usuario);
        if (usuario.debe_cambiar_password && window.location.pathname !== '/cuenta') {
          window.location.replace('/cuenta?forzado=1');
          return;
        }
        setSesion({ estado: 'lista', usuario });
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) {
          olvidarUsuario();
          window.location.replace('/login');
        }
      });
    return () => {
      vigente = false;
    };
  }, []);

  return sesion;
}

export const UsuarioContext = createContext<Usuario | null>(null);

/** Usuario autenticado. Solo dentro de <AuthGate>. */
export function useUsuario(): Usuario {
  const usuario = useContext(UsuarioContext);
  if (!usuario) throw new Error('useUsuario debe usarse dentro de <AuthGate>');
  return usuario;
}
