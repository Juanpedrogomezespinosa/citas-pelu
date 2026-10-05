/**
 * Vista de un día con una columna por profesional (como la agenda en papel de
 * un salón). Las citas se posicionan por hora; los bloqueos (vacaciones,
 * festivos...) se muestran rayados.
 */
import { cn } from '../../lib/cn';
import { formatHora, nombreCompleto } from '../../lib/format';
import type { Bloqueo, Cita, Empleado } from '../../lib/types';

interface AgendaProfesionalesProps {
  dia: string; // 'YYYY-MM-DD'
  citas: Cita[];
  bloqueos: Bloqueo[];
  empleados: Empleado[];
  onSeleccionar: (cita: Cita) => void;
}

const PX_POR_MINUTO = 1.1;
const ETIQUETA_BLOQUEO = {
  vacaciones: 'Vacaciones',
  festivo: 'Festivo',
  baja: 'Baja',
  formacion: 'Formación',
  otro: 'No disponible',
} as const;

const minutosDesdeMedianoche = (iso: string, dia: string) => {
  const inicioDia = new Date(`${dia}T00:00`).getTime();
  return Math.round((new Date(iso).getTime() - inicioDia) / 60_000);
};

export function AgendaProfesionales({ dia, citas, bloqueos, empleados, onSeleccionar }: AgendaProfesionalesProps) {
  const visibles = citas.filter((c) => c.estado !== 'cancelada');

  // Rango visible: 08:00-21:00, ampliado si alguna cita se sale
  const minutos = visibles.flatMap((c) => [minutosDesdeMedianoche(c.fecha_inicio, dia), minutosDesdeMedianoche(c.fecha_fin, dia)]);
  const inicio = Math.min(8 * 60, ...minutos.map((m) => Math.floor(m / 60) * 60));
  const fin = Math.max(21 * 60, ...minutos.map((m) => Math.ceil(m / 60) * 60));
  const alto = (fin - inicio) * PX_POR_MINUTO;
  const horas = Array.from({ length: (fin - inicio) / 60 + 1 }, (_, i) => inicio / 60 + i);

  const posicion = (desde: string, hasta: string) => {
    const top = Math.max(0, minutosDesdeMedianoche(desde, dia) - inicio) * PX_POR_MINUTO;
    const bottom = Math.min(fin - inicio, minutosDesdeMedianoche(hasta, dia) - inicio) * PX_POR_MINUTO;
    return { top, height: Math.max(bottom - top, 18) };
  };

  if (empleados.length === 0) return <p className="text-sm text-stone-500">No hay profesionales activos.</p>;

  return (
    <div className="card overflow-x-auto">
      <div className="flex min-w-fit" style={{ minWidth: `${4 + empleados.length * 11}rem` }}>
        {/* Escala horaria */}
        <div className="w-14 shrink-0 border-r border-stone-200 pt-10">
          <div className="relative" style={{ height: alto }}>
            {horas.map((h) => (
              <span
                key={h}
                className="absolute right-2 -translate-y-1/2 text-xs text-stone-500 tabular-nums"
                style={{ top: (h * 60 - inicio) * PX_POR_MINUTO }}
              >
                {String(h).padStart(2, '0')}:00
              </span>
            ))}
          </div>
        </div>

        {empleados.map((e) => {
          const suyas = visibles.filter((c) => c.empleado_id === e.id);
          const susBloqueos = bloqueos.filter((b) => b.empleado_id === null || b.empleado_id === e.id);
          return (
            <section
              key={e.id}
              aria-label={`Agenda de ${nombreCompleto(e)}`}
              className="min-w-44 flex-1 border-r border-stone-100 last:border-r-0"
            >
              <h3 className="sticky top-0 flex h-10 items-center gap-2 border-b border-stone-200 bg-white px-3 text-sm font-medium text-stone-900">
                <span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: e.color_calendario }} />
                <span className="truncate">{nombreCompleto(e)}</span>
                <span className="ml-auto text-xs font-normal text-stone-500">{suyas.length}</span>
              </h3>
              <div className="relative" style={{ height: alto }}>
                {horas.map((h) => (
                  <div
                    key={h}
                    aria-hidden="true"
                    className="absolute inset-x-0 border-t border-stone-100"
                    style={{ top: (h * 60 - inicio) * PX_POR_MINUTO }}
                  />
                ))}

                {susBloqueos.map((b) => (
                  <div
                    key={b.id}
                    className="absolute inset-x-1 overflow-hidden rounded-md border border-dashed border-stone-300 bg-[repeating-linear-gradient(45deg,var(--color-stone-100),var(--color-stone-100)_6px,white_6px,white_12px)] px-2 py-1 text-xs text-stone-600"
                    style={posicion(b.fecha_inicio, b.fecha_fin)}
                  >
                    <span className="font-medium">{ETIQUETA_BLOQUEO[b.tipo]}</span>
                    {b.motivo && <span className="block truncate">{b.motivo}</span>}
                  </div>
                ))}

                {suyas.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onSeleccionar(c)}
                    className={cn(
                      'absolute inset-x-1 overflow-hidden rounded-md border-l-4 bg-white px-2 py-1 text-left text-xs shadow-sm ring-1 ring-stone-200',
                      'hover:ring-brand-300 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none',
                      c.estado === 'pendiente' && 'bg-amber-50',
                      (c.estado === 'completada' || c.estado === 'no_asistio') && 'opacity-60',
                    )}
                    style={{ ...posicion(c.fecha_inicio, c.fecha_fin), borderLeftColor: e.color_calendario }}
                  >
                    <span className="block font-medium text-stone-900 tabular-nums">
                      {formatHora(c.fecha_inicio)} · {c.cliente_nombre}
                    </span>
                    <span className="block truncate text-stone-600">{c.servicios.map((s) => s.nombre).join(', ')}</span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
