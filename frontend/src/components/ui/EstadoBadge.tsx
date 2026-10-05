import { cn } from '../../lib/cn';
import { ESTADO_LABEL } from '../../lib/format';
import type { EstadoCita } from '../../lib/types';

const STYLES: Record<EstadoCita, string> = {
  pendiente: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  confirmada: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20',
  completada: 'bg-sky-50 text-sky-800 ring-sky-600/20',
  cancelada: 'bg-stone-100 text-stone-600 ring-stone-500/20',
  no_asistio: 'bg-red-50 text-red-800 ring-red-600/20',
};

export function EstadoBadge({ estado, className }: { estado: EstadoCita; className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', STYLES[estado], className)}
    >
      {ESTADO_LABEL[estado]}
    </span>
  );
}
