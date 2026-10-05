/**
 * Últimos mensajes de WhatsApp (enviados y respuestas de clientes).
 * Está al final de la página: se hidrata con client:visible, solo cuando
 * el usuario hace scroll hasta aquí.
 */
import { useAction } from '../../hooks/useAction';
import { useAsync } from '../../hooks/useAsync';
import { useUsuario } from '../../hooks/useSession';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatFechaCorta, formatHora } from '../../lib/format';
import { tieneRol } from '../../lib/session';
import type { EstadoNotificacion, Notificacion } from '../../lib/types';
import { AuthGate } from '../auth/AuthGate';
import { Alert } from '../ui/Alert';
import { PageLoader } from '../ui/Spinner';

export function ActividadWhatsApp() {
  return (
    <AuthGate>
      <Actividad />
    </AuthGate>
  );
}

const TIPO_LABEL: Record<string, string> = {
  confirmacion_cita: 'Confirmación de cita',
  recordatorio: 'Recordatorio',
  cambio_cita: 'Cambio de cita',
  cancelacion: 'Cancelación',
  respuesta_automatica: 'Respuesta automática',
  mensaje_entrante: 'Respuesta del cliente',
};

const ESTADO_STYLE: Record<EstadoNotificacion, string> = {
  pendiente: 'text-stone-500',
  enviado: 'text-sky-700',
  entregado: 'text-sky-700',
  leido: 'text-emerald-700',
  fallido: 'text-red-700',
  recibido: 'text-brand-700',
};

function Actividad() {
  const usuario = useUsuario();
  // El registro de WhatsApp es de recepción y administración: para estilistas no se muestra
  return tieneRol(usuario, 'admin', 'recepcion') ? <ListaActividad /> : null;
}

function ListaActividad() {
  const { data, loading, error, reload } = useAsync(() => api.notificaciones.list({ limit: 8 }), []);
  const reintentar = useAction((id: number) => api.notificaciones.reintentar(id));

  return (
    <section aria-labelledby="titulo-actividad" className="card mt-8 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 id="titulo-actividad" className="font-display text-lg font-semibold text-stone-900">
          Actividad de WhatsApp
        </h2>
        <button type="button" onClick={reload} className="text-sm font-medium text-brand-700 hover:underline">
          Actualizar
        </button>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {loading && !data ? (
        <PageLoader />
      ) : data?.items.length ? (
        <ul className="divide-y divide-stone-100">
          {data.items.map((n) => (
            <ItemNotificacion key={n.id} n={n} onReintentar={() => void reintentar.run(n.id).then(reload)} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-stone-500">Aún no hay mensajes.</p>
      )}
    </section>
  );
}

function ItemNotificacion({ n, onReintentar }: { n: Notificacion; onReintentar: () => void }) {
  const entrante = n.direccion === 'entrante';
  return (
    <li className="flex gap-3 py-3">
      <span
        aria-hidden="true"
        className={cn(
          'mt-1 size-2 shrink-0 rounded-full',
          entrante ? 'bg-brand-500' : n.estado === 'fallido' ? 'bg-red-500' : 'bg-emerald-500',
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-stone-900">
          {TIPO_LABEL[n.tipo] ?? n.tipo}
          <span className="font-normal text-stone-500"> · {n.telefono}</span>
        </p>
        <p className="line-clamp-2 text-sm whitespace-pre-line text-stone-600">{n.mensaje}</p>
        {n.error && <p className="text-xs text-red-700">{n.error}</p>}
        {n.estado === 'fallido' && (
          <button type="button" onClick={onReintentar} className="mt-1 text-xs font-medium text-brand-700 hover:underline">
            Reintentar envío
          </button>
        )}
        {n.estado === 'pendiente' && n.intentos > 0 && <p className="text-xs text-amber-700">Reintentando ({n.intentos} intento/s)…</p>}
      </div>
      <div className="shrink-0 text-right text-xs">
        <p className="text-stone-500 tabular-nums">
          {formatFechaCorta(n.created_at)} {formatHora(n.created_at)}
        </p>
        <p className={cn('font-medium capitalize', ESTADO_STYLE[n.estado])}>{n.estado}</p>
      </div>
    </li>
  );
}
