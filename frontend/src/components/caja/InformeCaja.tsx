import { useState } from 'react';
import { useAsync } from '../../hooks/useAsync';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatEuros, toDateKey } from '../../lib/format';
import { Alert } from '../ui/Alert';
import { Field, Input } from '../ui/Field';
import { PageLoader } from '../ui/Spinner';
import { BarrasHorizontales, ColumnasDiarias } from './Graficos';
import { METODO_LABEL } from './NuevoCobro';

type Periodo = 'hoy' | 'semana' | 'mes' | 'mes_anterior' | 'personalizado';

function rangoDe(periodo: Exclude<Periodo, 'personalizado'>): { desde: string; hasta: string } {
  const hoy = new Date();
  const d = (y: number, m: number, dia: number) => toDateKey(new Date(y, m, dia));
  switch (periodo) {
    case 'hoy':
      return { desde: toDateKey(hoy), hasta: toDateKey(hoy) };
    case 'semana': {
      const lunes = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - ((hoy.getDay() + 6) % 7));
      return { desde: toDateKey(lunes), hasta: toDateKey(hoy) };
    }
    case 'mes':
      return { desde: d(hoy.getFullYear(), hoy.getMonth(), 1), hasta: toDateKey(hoy) };
    case 'mes_anterior':
      return { desde: d(hoy.getFullYear(), hoy.getMonth() - 1, 1), hasta: d(hoy.getFullYear(), hoy.getMonth(), 0) };
  }
}

const PERIODOS: { id: Periodo; label: string }[] = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'semana', label: 'Esta semana' },
  { id: 'mes', label: 'Este mes' },
  { id: 'mes_anterior', label: 'Mes anterior' },
  { id: 'personalizado', label: 'Personalizado' },
];

/** Informe de caja (administración): indicadores, evolución diaria y desgloses */
export function InformeCaja() {
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [rango, setRango] = useState(() => rangoDe('mes'));
  const valido = rango.desde <= rango.hasta;
  const { data, loading, error } = useAsync(() => api.cobros.informe(rango), [rango.desde, rango.hasta], { enabled: valido });

  const elegir = (p: Periodo) => {
    setPeriodo(p);
    if (p !== 'personalizado') setRango(rangoDe(p));
  };

  const r = data?.resumen;
  const indicadores = r
    ? [
        { label: 'Ingresos netos', valor: formatEuros(r.neto) },
        { label: 'Cobros', valor: r.num_cobros.toLocaleString('es-ES') },
        { label: 'Ticket medio', valor: formatEuros(r.num_cobros ? r.neto / r.num_cobros : 0) },
        { label: 'Descuentos', valor: formatEuros(r.descuentos) },
      ]
    : [];

  return (
    <div className="space-y-5">
      {/* Filtros en una sola fila sobre los gráficos */}
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div role="group" aria-label="Periodo" className="inline-flex flex-wrap rounded-lg bg-stone-100 p-1">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={periodo === p.id}
              onClick={() => elegir(p.id)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none',
                periodo === p.id ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600 hover:text-stone-900',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {periodo === 'personalizado' && (
          <>
            <Field label="Desde">
              {(a) => <Input {...a} type="date" value={rango.desde} onChange={(e) => setRango((x) => ({ ...x, desde: e.target.value }))} />}
            </Field>
            <Field label="Hasta" error={valido ? undefined : 'Debe ser posterior'}>
              {(a) => <Input {...a} type="date" value={rango.hasta} onChange={(e) => setRango((x) => ({ ...x, hasta: e.target.value }))} />}
            </Field>
          </>
        )}
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {loading && !data ? (
        <PageLoader />
      ) : data ? (
        <>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {indicadores.map((i) => (
              <div key={i.label} className="card px-4 py-3">
                <dt className="text-xs text-stone-500">{i.label}</dt>
                <dd className="mt-0.5 text-2xl font-semibold text-stone-900 tabular-nums">{i.valor}</dd>
              </div>
            ))}
          </dl>

          <ColumnasDiarias titulo="Ingresos netos por día" dias={data.por_dia} />

          <div className="grid gap-4 lg:grid-cols-2">
            <BarrasHorizontales
              titulo="Por método de pago"
              vacio="Sin cobros."
              filas={data.por_metodo.map((m) => ({ etiqueta: METODO_LABEL[m.metodo], valor: m.neto, detalle: `${m.num_cobros} cobro(s)` }))}
            />
            <BarrasHorizontales
              titulo="Producción por profesional (servicios, sin descuentos)"
              vacio="Sin servicios cobrados."
              filas={data.por_profesional.map((p) => ({ etiqueta: p.nombre, valor: p.importe }))}
            />
            <BarrasHorizontales
              titulo="Servicios más vendidos"
              vacio="Sin servicios cobrados."
              filas={data.por_servicio.slice(0, 8).map((s) => ({ etiqueta: s.nombre, valor: s.importe, detalle: `${s.cantidad} ud.` }))}
            />
            <BarrasHorizontales
              titulo="Venta de productos"
              vacio="Sin productos vendidos."
              filas={data.por_producto.slice(0, 8).map((p) => ({ etiqueta: p.nombre, valor: p.importe, detalle: `${p.cantidad} ud.` }))}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
