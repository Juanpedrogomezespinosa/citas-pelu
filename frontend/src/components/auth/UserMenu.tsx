import { useEffect, useState } from 'react';
import { cerrarSesion, getUsuario } from '../../lib/session';
import { ROL_LABEL, type Usuario } from '../../lib/types';

/** Isla de baja prioridad (client:idle): usuario actual, su cuenta y cierre de sesión */
export function UserMenu() {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  useEffect(() => setUsuario(getUsuario()), []);

  if (!usuario) return null;

  const iniciales = usuario.nombre
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex items-center gap-3">
      <a
        href="/cuenta"
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 hover:bg-stone-100 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
        title="Mi cuenta"
      >
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800"
        >
          {iniciales}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-stone-900">{usuario.nombre}</span>
          <span className="block truncate text-xs text-stone-500">{ROL_LABEL[usuario.rol]}</span>
        </span>
      </a>
      <button
        type="button"
        onClick={() => void cerrarSesion()}
        className="rounded-md px-2 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
      >
        Salir
      </button>
    </div>
  );
}
