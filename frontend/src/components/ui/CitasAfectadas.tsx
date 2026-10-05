import { formatFecha, formatHora } from '../../lib/format';
import type { CitaAfectada } from '../../lib/types';

/** Extrae las citas que la API devuelve en los conflictos (bajas, bloqueos, RGPD) */
export function citasDeError(details: Record<string, unknown>): CitaAfectada[] {
  return Array.isArray(details['citas']) ? (details['citas'] as CitaAfectada[]) : [];
}

/** Lista de citas que impiden una operación, con enlace para reprogramar cada una */
export function CitasAfectadas({ citas }: { citas: CitaAfectada[] }) {
  if (citas.length === 0) return null;
  return (
    <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg bg-stone-50 p-2 text-sm">
      {citas.map((c) => (
        <li key={c.id} className="flex items-center justify-between gap-3">
          <span>
            <span className="inline-block first-letter:uppercase">{formatFecha(c.fecha_inicio)}</span> · {formatHora(c.fecha_inicio)}
            {c.cliente_nombre && <span className="text-stone-600"> · {c.cliente_nombre}</span>}
            {c.empleado_nombre && <span className="text-stone-500"> ({c.empleado_nombre})</span>}
          </span>
          <a href={`/citas/nueva?id=${c.id}`} className="shrink-0 text-xs font-medium text-brand-700 hover:underline">
            Reprogramar
          </a>
        </li>
      ))}
    </ul>
  );
}
