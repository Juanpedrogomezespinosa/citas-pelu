import type { AccionCita } from '../../hooks/useCitaAcciones';
import { useUsuario } from '../../hooks/useSession';
import { formatEuros, formatHora } from '../../lib/format';
import { tieneRol } from '../../lib/session';
import type { Cita } from '../../lib/types';
import { Button } from '../ui/Button';
import { EstadoBadge } from '../ui/EstadoBadge';

interface CitaCardProps {
  cita: Cita;
  onAccion: (accion: AccionCita, cita: Cita) => void;
  /** Versión compacta (sin borde de tarjeta) para usar dentro de un modal */
  embebida?: boolean;
}

const LINK_SECUNDARIO =
  'inline-flex items-center rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-800 shadow-xs hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:outline-none';

export function CitaCard({ cita, onAccion, embebida = false }: CitaCardProps) {
  const usuario = useUsuario();
  const gestion = tieneRol(usuario, 'admin', 'recepcion');
  const activa = cita.estado === 'pendiente' || cita.estado === 'confirmada';
  const yaEmpezo = new Date(cita.fecha_inicio) <= new Date();

  return (
    <article className={embebida ? 'flex flex-col gap-3' : 'card flex flex-col gap-3 p-4 sm:flex-row sm:items-start'}>
      <div className="flex items-center gap-3 sm:w-28 sm:flex-col sm:items-start sm:gap-0">
        <p className="text-lg font-semibold text-stone-900 tabular-nums">{formatHora(cita.fecha_inicio)}</p>
        <p className="text-xs text-stone-500 tabular-nums">hasta {formatHora(cita.fecha_fin)}</p>
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate font-medium text-stone-900">{cita.cliente_nombre}</h3>
          <EstadoBadge estado={cita.estado} />
          {cita.confirmada_via === 'whatsapp' && cita.estado === 'confirmada' && (
            <span className="text-xs font-medium text-emerald-700">vía WhatsApp</span>
          )}
          {cita.cobrada && <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700">Cobrada</span>}
        </div>
        <p className="text-sm text-stone-600">{cita.servicios.map((s) => s.nombre).join(' · ')}</p>
        <p className="flex items-center gap-1.5 text-xs text-stone-500">
          <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: cita.empleado_color }} />
          {cita.empleado_nombre} · {formatEuros(cita.precio_total)}
        </p>
        {cita.notas && <p className="text-xs text-stone-500 italic">“{cita.notas}”</p>}
      </div>

      <div className="flex flex-wrap gap-2 sm:max-w-60 sm:justify-end">
        {activa && cita.estado === 'pendiente' && (
          <Button size="sm" variant="secondary" onClick={() => onAccion('confirmar', cita)}>
            Confirmar
          </Button>
        )}
        {activa && yaEmpezo && (
          <>
            <Button size="sm" onClick={() => onAccion('completar', cita)}>
              Completar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onAccion('no_asistio', cita)}>
              No vino
            </Button>
          </>
        )}
        {activa && !yaEmpezo && gestion && (
          <>
            <a href={`/citas/nueva?id=${cita.id}`} className={LINK_SECUNDARIO}>
              Reprogramar
            </a>
            {cita.cliente_acepta_whatsapp && (
              <Button size="sm" variant="ghost" onClick={() => onAccion('recordatorio', cita)}>
                Recordar
              </Button>
            )}
          </>
        )}
        {activa && gestion && (
          <Button size="sm" variant="ghost" className="text-red-700 hover:bg-red-50" onClick={() => onAccion('cancelar', cita)}>
            Cancelar
          </Button>
        )}
        {cita.estado === 'completada' && !cita.cobrada && gestion && (
          <a href={`/caja?cita=${cita.id}`} className={LINK_SECUNDARIO}>
            Cobrar
          </a>
        )}
      </div>
    </article>
  );
}
