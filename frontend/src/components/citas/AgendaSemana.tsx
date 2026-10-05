/**
 * Vista semanal (lunes a domingo) de la semana del día seleccionado.
 */
import { cn } from '../../lib/cn';
import { formatHora, fromDateKey, toDateKey, todayKey } from '../../lib/format';
import type { Bloqueo, Cita } from '../../lib/types';

interface AgendaSemanaProps {
  dia: string;
  porDia: ReadonlyMap<string, Cita[]>;
  bloqueosDelDia: (dia: string) => Bloqueo[];
  onSeleccionarDia: (dia: string) => void;
  onSeleccionarCita: (cita: Cita) => void;
}

const formatoDia = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric' });
const ETIQUETA_BLOQUEO = {
  vacaciones: 'Vacaciones',
  festivo: 'Festivo',
  baja: 'Baja',
  formacion: 'Formación',
  otro: 'No disponible',
} as const;

export function AgendaSemana({ dia, porDia, bloqueosDelDia, onSeleccionarDia, onSeleccionarCita }: AgendaSemanaProps) {
  const base = fromDateKey(dia);
  const lunes = new Date(base.getFullYear(), base.getMonth(), base.getDate() - ((base.getDay() + 6) % 7));
  const semana = Array.from({ length: 7 }, (_, i) => toDateKey(new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + i)));
  const hoy = todayKey();

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-3xl grid-cols-7 gap-2">
        {semana.map((key) => {
          const citas = (porDia.get(key) ?? []).filter((c) => c.estado !== 'cancelada');
          const bloqueos = bloqueosDelDia(key);
          return (
            <section
              key={key}
              aria-label={formatoDia.format(fromDateKey(key))}
              className={cn('card flex min-h-64 flex-col p-2', key === dia && 'ring-2 ring-brand-300')}
            >
              <button
                type="button"
                onClick={() => onSeleccionarDia(key)}
                className={cn(
                  'mb-2 rounded-md px-2 py-1 text-left text-sm font-medium capitalize hover:bg-stone-100 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none',
                  key === hoy ? 'text-brand-700' : 'text-stone-800',
                )}
              >
                {formatoDia.format(fromDateKey(key))}
                <span className="ml-1 text-xs font-normal text-stone-500">({citas.length})</span>
              </button>
              <ul className="space-y-1">
                {bloqueos.map((b) => (
                  <li key={`b${b.id}`} className="rounded bg-stone-100 px-2 py-1 text-xs text-stone-600">
                    {ETIQUETA_BLOQUEO[b.tipo]}
                    {b.empleado_nombre ? ` · ${b.empleado_nombre}` : ' · Todo el salón'}
                  </li>
                ))}
                {citas.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => onSeleccionarCita(c)}
                      className="w-full rounded border-l-4 bg-stone-50 px-2 py-1 text-left text-xs hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
                      style={{ borderLeftColor: c.empleado_color }}
                    >
                      <span className="font-medium text-stone-900 tabular-nums">{formatHora(c.fecha_inicio)}</span>{' '}
                      <span className="text-stone-700">{c.cliente_nombre}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
