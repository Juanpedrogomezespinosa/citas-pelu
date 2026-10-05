import { cn } from '../../lib/cn';
import { formatDuracion, formatEuros } from '../../lib/format';
import type { Servicio } from '../../lib/types';

interface ServicePickerProps {
  servicios: Servicio[];
  seleccionados: number[];
  onToggle: (id: number) => void;
  error?: string | undefined;
}

const CATEGORIA_LABEL: Record<string, string> = {
  corte: 'Corte',
  color: 'Color',
  tratamiento: 'Tratamientos',
  peinado: 'Peinados',
  barberia: 'Barbería',
  otros: 'Otros',
};

export function ServicePicker({ servicios, seleccionados, onToggle, error }: ServicePickerProps) {
  const porCategoria = Map.groupBy(servicios, (s) => s.categoria);

  return (
    <fieldset aria-describedby={error ? 'servicios-error' : undefined}>
      <legend className="mb-2 text-sm font-medium text-stone-700">
        Servicios{' '}
        <span className="text-brand-700" aria-hidden="true">
          *
        </span>
      </legend>
      <div className="space-y-4">
        {[...porCategoria].map(([categoria, lista]) => (
          <div key={categoria}>
            <p className="mb-1.5 text-xs font-medium tracking-wide text-stone-500 uppercase">{CATEGORIA_LABEL[categoria] ?? categoria}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {lista.map((s) => {
                const checked = seleccionados.includes(s.id);
                return (
                  <label
                    key={s.id}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm has-focus-visible:ring-2 has-focus-visible:ring-brand-500',
                      checked ? 'border-brand-400 bg-brand-50' : 'border-stone-200 bg-white hover:border-stone-300',
                    )}
                  >
                    <input type="checkbox" checked={checked} onChange={() => onToggle(s.id)} className="mt-0.5 size-4 accent-brand-700" />
                    <span className="flex-1">
                      <span className="block font-medium text-stone-900">{s.nombre}</span>
                      <span className="text-xs text-stone-500">
                        {formatDuracion(s.duracion_minutos)} · {formatEuros(s.precio)}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {error && (
        <p id="servicios-error" className="mt-1.5 text-xs text-red-700">
          {error}
        </p>
      )}
    </fieldset>
  );
}
