import type { ReactNode } from 'react';
import { UsuarioContext, useValidarSesion } from '../../hooks/useSession';
import type { Rol } from '../../lib/types';
import { PageLoader } from '../ui/Spinner';

interface AuthGateProps {
  children: ReactNode;
  /** Roles con acceso a esta isla. Sin indicar: cualquier usuario autenticado. */
  roles?: Rol[];
}

/**
 * Envuelve cada isla protegida: no pinta nada hasta validar la sesión con la
 * API y comprueba el rol. La seguridad real la impone el backend; esto evita
 * mostrar pantallas que el usuario no podría usar.
 */
export function AuthGate({ children, roles }: AuthGateProps) {
  const sesion = useValidarSesion();

  if (sesion.estado === 'cargando') return <PageLoader label="Comprobando sesión…" />;

  if (roles && !roles.includes(sesion.usuario.rol)) {
    return (
      <div className="card mx-auto max-w-md px-6 py-10 text-center">
        <p className="font-medium text-stone-900">No tienes acceso a esta sección</p>
        <p className="mt-1 text-sm text-stone-600">Pide a administración que revise tus permisos.</p>
        <a href="/" className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline">
          Volver a la agenda
        </a>
      </div>
    );
  }

  return <UsuarioContext.Provider value={sesion.usuario}>{children}</UsuarioContext.Provider>;
}
