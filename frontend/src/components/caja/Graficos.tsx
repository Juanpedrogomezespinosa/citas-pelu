/**
 * Gráficos del informe de caja (skill dataviz):
 *  - Una sola serie por gráfico -> un solo tono (sin leyenda: el título la nombra).
 *  - Barras <= 24px, extremo redondeado de 4px y base recta, rejilla hairline.
 *  - Texto siempre en tinta (nunca en el color de la serie).
 *  - Hover con tooltip en cada columna y alternativa en tabla.
 * Color validado con scripts/validate_palette.js: #ad2e5f (brand-600) pasa
 * banda de luminosidad, croma y contraste >= 3:1 sobre la superficie.
 */
import { useId, useState } from 'react';
import { cn } from '../../lib/cn';
import { formatEuros } from '../../lib/format';

const COLOR_SERIE = 'var(--color-brand-600)';

export interface FilaBarra {
  etiqueta: string;
  valor: number;
  detalle?: string;
}

/** Barras horizontales de magnitud con el valor en la punta */
export function BarrasHorizontales({ titulo, filas, vacio }: { titulo: string; filas: FilaBarra[]; vacio: string }) {
  const max = Math.max(...filas.map((f) => f.valor), 0);
  return (
    <figure className="card p-5">
      <figcaption className="mb-4 text-sm font-semibold text-stone-800">{titulo}</figcaption>
      {filas.length === 0 ? (
        <p className="text-sm text-stone-500">{vacio}</p>
      ) : (
        <ul className="space-y-3">
          {filas.map((f) => (
            <li key={f.etiqueta}>
              <div className="mb-1 flex justify-between gap-3 text-xs">
                <span className="truncate text-stone-700">{f.etiqueta}</span>
                {f.detalle && <span className="shrink-0 text-stone-500">{f.detalle}</span>}
              </div>
              <div className="flex items-center gap-2">
                <div className="h-4 flex-1">
                  <div
                    className="h-full rounded-r-[4px] motion-safe:transition-[width]"
                    style={{
                      width: `${max > 0 ? (f.valor / max) * 100 : 0}%`,
                      minWidth: f.valor > 0 ? 4 : 0,
                      backgroundColor: COLOR_SERIE,
                    }}
                  />
                </div>
                <span className="w-20 shrink-0 text-right text-sm font-medium text-stone-900 tabular-nums">{formatEuros(f.valor)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

const fechaCorta = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
const fechaLarga = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

/** Columnas de ingresos por día con tooltip y vista de tabla */
export function ColumnasDiarias({ titulo, dias }: { titulo: string; dias: { fecha: string; neto: number }[] }) {
  const [activo, setActivo] = useState<number | null>(null);
  const [verTabla, setVerTabla] = useState(false);
  const idTabla = useId();

  const ALTO = 160;
  const max = Math.max(...dias.map((d) => d.neto), 0);
  // Marcas del eje Y redondeadas a valores limpios
  const paso = max <= 100 ? 25 : max <= 500 ? 100 : max <= 2000 ? 500 : 1000;
  const techo = Math.max(paso, Math.ceil(max / paso) * paso);
  const marcas = Array.from({ length: techo / paso + 1 }, (_, i) => i * paso);
  const iMax = dias.findIndex((d) => d.neto === max);
  const fecha = (iso: string) => new Date(`${iso}T00:00`);

  return (
    <figure className="card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <figcaption className="text-sm font-semibold text-stone-800">{titulo}</figcaption>
        <button
          type="button"
          aria-controls={idTabla}
          aria-expanded={verTabla}
          onClick={() => setVerTabla((v) => !v)}
          className="text-xs font-medium text-brand-700 hover:underline"
        >
          {verTabla ? 'Ver gráfico' : 'Ver tabla'}
        </button>
      </div>

      {dias.length === 0 ? (
        <p className="text-sm text-stone-500">Sin cobros en el periodo.</p>
      ) : verTabla ? (
        <table id={idTabla} className="w-full text-sm">
          <thead className="text-xs text-stone-500">
            <tr>
              <th scope="col" className="py-1 text-left font-medium">
                Día
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Ingresos netos
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {dias.map((d) => (
              <tr key={d.fecha}>
                <td className="py-1.5 first-letter:uppercase">{fechaLarga.format(fecha(d.fecha))}</td>
                <td className="py-1.5 text-right tabular-nums">{formatEuros(d.neto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div
          className="flex gap-2 pt-3"
          role="img"
          aria-label={`${titulo}. Máximo ${formatEuros(max)}. Usa "Ver tabla" para los valores de cada día.`}
        >
          {/* Eje Y */}
          <div className="relative w-12 shrink-0 text-right text-[11px] text-stone-500 tabular-nums" style={{ height: ALTO }}>
            {marcas.map((m) => (
              <span key={m} className="absolute right-0 -translate-y-1/2" style={{ bottom: `${(m / techo) * 100}%` }}>
                {m.toLocaleString('es-ES')} €
              </span>
            ))}
          </div>
          <div className="min-w-0 flex-1 overflow-x-auto">
            <div className="relative" style={{ height: ALTO, minWidth: dias.length * 14 }}>
              {marcas.map((m) => (
                <div
                  key={m}
                  aria-hidden="true"
                  className="absolute inset-x-0 border-t border-stone-200"
                  style={{ bottom: `${(m / techo) * 100}%` }}
                />
              ))}
              <div className="absolute inset-0 flex items-end gap-0.5">
                {dias.map((d, i) => (
                  <div
                    key={d.fecha}
                    className="relative flex h-full flex-1 items-end justify-center"
                    onMouseEnter={() => setActivo(i)}
                    onMouseLeave={() => setActivo(null)}
                    onFocus={() => setActivo(i)}
                    onBlur={() => setActivo(null)}
                    tabIndex={0}
                    aria-label={`${fechaLarga.format(fecha(d.fecha))}: ${formatEuros(d.neto)}`}
                  >
                    <div
                      className={cn('w-full max-w-6 rounded-t-[4px]', activo !== null && activo !== i && 'opacity-60')}
                      style={{
                        height: `${techo > 0 ? (d.neto / techo) * 100 : 0}%`,
                        minHeight: d.neto > 0 ? 4 : 0,
                        backgroundColor: COLOR_SERIE,
                      }}
                    />
                    {/* Etiqueta directa solo en el máximo */}
                    {i === iMax && activo === null && dias.length > 1 && (
                      <span
                        className="absolute text-[11px] font-medium text-stone-700 tabular-nums"
                        style={{ bottom: `calc(${(d.neto / techo) * 100}% + 4px)` }}
                      >
                        {formatEuros(d.neto)}
                      </span>
                    )}
                    {activo === i && (
                      <div
                        role="tooltip"
                        className="pointer-events-none absolute bottom-full z-10 mb-1 rounded-md bg-stone-900 px-2 py-1 text-xs whitespace-nowrap text-white shadow"
                      >
                        <span className="inline-block first-letter:uppercase">{fechaLarga.format(fecha(d.fecha))}</span>
                        <strong className="block tabular-nums">{formatEuros(d.neto)}</strong>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-stone-500">
              <span>{fechaCorta.format(fecha(dias[0]!.fecha))}</span>
              {dias.length > 1 && <span>{fechaCorta.format(fecha(dias[dias.length - 1]!.fecha))}</span>}
            </div>
          </div>
        </div>
      )}
    </figure>
  );
}
