/**
 * Calendario mensual interactivo y accesible.
 *  - Semana de lunes a domingo (convención española).
 *  - Navegación con teclado: flechas (día/semana), Inicio/Fin (semana),
 *    RePág/AvPág (mes). Foco "itinerante": solo el día activo es tabulable.
 *  - `marcadores` muestra cuántas citas hay cada día.
 */
import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { cn } from '../../lib/cn';
import { diasDelMes, formatFecha, formatMesAnio, fromDateKey, toDateKey, todayKey } from '../../lib/format';

export interface CalendarProps {
  /** Día seleccionado 'YYYY-MM-DD' */
  value: string;
  onChange: (dateKey: string) => void;
  /** Mes visible (cualquier día del mes) */
  month: Date;
  onMonthChange: (month: Date) => void;
  /** Nº de citas por día, para pintar indicadores */
  marcadores?: ReadonlyMap<string, number>;
  /** Días anteriores a este no se pueden seleccionar */
  minDate?: string;
  className?: string;
}

const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export function Calendar({ value, onChange, month, onMonthChange, marcadores, minDate, className }: CalendarProps) {
  const dias = useMemo(() => diasDelMes(month), [month]);
  const hoy = todayKey();
  // Día que recibe el Tab: el seleccionado si está visible; si no, el día 1
  const tabbable = dias.some((d) => toDateKey(d) === value) ? value : toDateKey(new Date(month.getFullYear(), month.getMonth(), 1));
  const gridRef = useRef<HTMLDivElement>(null);
  const focusPending = useRef(false);

  // Tras navegar con teclado, mover el foco al nuevo día seleccionado
  useEffect(() => {
    if (!focusPending.current) return;
    focusPending.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-key="${value}"]`)?.focus();
  }, [value, month]);

  const deshabilitado = (key: string) => Boolean(minDate && key < minDate);

  function seleccionar(date: Date, fromKeyboard = false) {
    const key = toDateKey(date);
    if (deshabilitado(key)) return;
    if (date.getMonth() !== month.getMonth() || date.getFullYear() !== month.getFullYear()) {
      onMonthChange(new Date(date.getFullYear(), date.getMonth(), 1));
    }
    focusPending.current = fromKeyboard;
    onChange(key);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const actual = fromDateKey(value);
    const desplazamientos: Record<string, () => Date> = {
      ArrowLeft: () => new Date(actual.getFullYear(), actual.getMonth(), actual.getDate() - 1),
      ArrowRight: () => new Date(actual.getFullYear(), actual.getMonth(), actual.getDate() + 1),
      ArrowUp: () => new Date(actual.getFullYear(), actual.getMonth(), actual.getDate() - 7),
      ArrowDown: () => new Date(actual.getFullYear(), actual.getMonth(), actual.getDate() + 7),
      Home: () => new Date(actual.getFullYear(), actual.getMonth(), actual.getDate() - ((actual.getDay() + 6) % 7)),
      End: () => new Date(actual.getFullYear(), actual.getMonth(), actual.getDate() + (6 - ((actual.getDay() + 6) % 7))),
      PageUp: () => new Date(actual.getFullYear(), actual.getMonth() - 1, actual.getDate()),
      PageDown: () => new Date(actual.getFullYear(), actual.getMonth() + 1, actual.getDate()),
    };
    const destino = desplazamientos[event.key];
    if (!destino) return;
    event.preventDefault();
    seleccionar(destino(), true);
  }

  const cambiarMes = (delta: number) => onMonthChange(new Date(month.getFullYear(), month.getMonth() + delta, 1));

  return (
    <div className={cn('card p-4', className)}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-base font-semibold text-stone-900 first-letter:uppercase" aria-live="polite">
          {formatMesAnio(month)}
        </h2>
        <div className="flex gap-1">
          <NavButton
            label="Mes anterior"
            onClick={() => cambiarMes(-1)}
            path="M12.79 5.23a.75.75 0 0 1-.02 1.06L8.832 10l3.938 3.71a.75.75 0 1 1-1.04 1.08l-4.5-4.25a.75.75 0 0 1 0-1.08l4.5-4.25a.75.75 0 0 1 1.06.02Z"
          />
          <NavButton
            label="Mes siguiente"
            onClick={() => cambiarMes(1)}
            path="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
          />
        </div>
      </div>

      <div className="grid grid-cols-7 text-center text-xs font-medium text-stone-500" aria-hidden="true">
        {DIAS_SEMANA.map((d) => (
          <span key={d} className="py-1">
            {d}
          </span>
        ))}
      </div>

      <div ref={gridRef} role="group" aria-label="Días del mes" className="grid grid-cols-7 gap-1" onKeyDown={onKeyDown}>
        {dias.map((date) => {
          const key = toDateKey(date);
          const fueraDeMes = date.getMonth() !== month.getMonth();
          const seleccionado = key === value;
          const citas = marcadores?.get(key) ?? 0;
          const disabled = deshabilitado(key);

          return (
            <button
              key={key}
              type="button"
              data-key={key}
              tabIndex={key === tabbable ? 0 : -1}
              disabled={disabled}
              aria-pressed={seleccionado}
              aria-current={key === hoy ? 'date' : undefined}
              aria-label={`${formatFecha(date)}${citas ? `, ${citas} ${citas === 1 ? 'cita' : 'citas'}` : ''}`}
              onClick={() => seleccionar(date)}
              className={cn(
                'relative flex aspect-square flex-col items-center justify-center rounded-lg text-sm',
                fueraDeMes ? 'text-stone-400' : 'text-stone-800',
                key === hoy && !seleccionado && 'font-semibold text-brand-700 ring-1 ring-brand-300',
                seleccionado ? 'bg-brand-700 font-semibold text-white' : 'hover:bg-brand-50',
                'focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 focus-visible:outline-none',
                'disabled:cursor-not-allowed disabled:text-stone-300 disabled:hover:bg-transparent motion-safe:transition-colors',
              )}
            >
              {date.getDate()}
              {citas > 0 && (
                <span
                  aria-hidden="true"
                  className={cn('absolute bottom-1 size-1.5 rounded-full', seleccionado ? 'bg-white' : 'bg-brand-500')}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NavButton({ label, onClick, path }: { label: string; onClick: () => void; path: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="rounded-md p-1.5 text-stone-600 hover:bg-stone-100 hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="size-5" aria-hidden="true">
        <path fillRule="evenodd" d={path} clipRule="evenodd" />
      </svg>
    </button>
  );
}
