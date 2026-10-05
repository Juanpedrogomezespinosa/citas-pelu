import { cn } from '../../lib/cn';
import { Alert } from '../ui/Alert';
import { Spinner } from '../ui/Spinner';

interface SlotPickerProps {
  huecos: string[] | null;
  loading: boolean;
  error: string | null;
  value: string;
  onChange: (hora: string) => void;
  /** Mensaje cuando aún faltan datos para calcular huecos */
  placeholder: string | null;
  fieldError?: string | undefined;
}

/** Selector de hora: solo muestra los huecos libres que calcula el backend */
export function SlotPicker({ huecos, loading, error, value, onChange, placeholder, fieldError }: SlotPickerProps) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-stone-700">
        Hora{' '}
        <span className="text-brand-700" aria-hidden="true">
          *
        </span>
      </legend>

      {placeholder ? (
        <p className="text-sm text-stone-500">{placeholder}</p>
      ) : loading ? (
        <Spinner label="Buscando huecos libres…" className="text-brand-700" />
      ) : error ? (
        <Alert tone="error">{error}</Alert>
      ) : !huecos?.length ? (
        <p className="rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-600">
          No hay huecos libres ese día. Prueba con otra fecha o profesional.
        </p>
      ) : (
        <div role="radiogroup" aria-label="Horas disponibles" className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {huecos.map((hora) => (
            <button
              key={hora}
              type="button"
              role="radio"
              aria-checked={hora === value}
              onClick={() => onChange(hora)}
              className={cn(
                'rounded-lg border px-2 py-1.5 text-sm tabular-nums focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none motion-safe:transition-colors',
                hora === value
                  ? 'border-brand-700 bg-brand-700 font-medium text-white'
                  : 'border-stone-200 bg-white text-stone-800 hover:border-brand-300 hover:bg-brand-50',
              )}
            >
              {hora}
            </button>
          ))}
        </div>
      )}
      {fieldError && <p className="mt-1.5 text-xs text-red-700">{fieldError}</p>}
    </fieldset>
  );
}
