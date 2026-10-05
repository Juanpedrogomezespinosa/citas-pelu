/**
 * Historial de citas con filtros (fechas, estado, cliente) y paginación.
 * Al pulsar una fila se abre el detalle con la traza de WhatsApp.
 */
import { useEffect, useState } from 'react';
import { useAsync } from '../../hooks/useAsync';
import { useDebounce } from '../../hooks/useDebounce';
import { api } from '../../lib/api';
import { ESTADO_LABEL, formatEuros, formatFechaCorta, formatHora } from '../../lib/format';
import { ESTADOS_CITA, type Cita, type EstadoCita } from '../../lib/types';
import { AuthGate } from '../auth/AuthGate';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { EstadoBadge } from '../ui/EstadoBadge';
import { Field, Input, Select } from '../ui/Field';
import { PageLoader } from '../ui/Spinner';
import { CitaDetalleModal } from './CitaDetalleModal';

export function AppointmentHistory() {
  return (
    <AuthGate>
      <Historial />
    </AuthGate>
  );
}

interface Filtros {
  desde: string;
  hasta: string;
  estado: EstadoCita | '';
  q: string;
}

function Historial() {
  const [filtros, setFiltros] = useState<Filtros>({ desde: '', hasta: '', estado: '', q: '' });
  const [page, setPage] = useState(1);
  const [detalle, setDetalle] = useState<Cita | null>(null);
  const q = useDebounce(filtros.q.trim());

  useEffect(() => setPage(1), [filtros.desde, filtros.hasta, filtros.estado, q]);

  const rangoInvalido = Boolean(filtros.desde && filtros.hasta && filtros.desde > filtros.hasta);
  const { data, loading, error } = useAsync(
    () => api.citas.list({ desde: filtros.desde, hasta: filtros.hasta, estado: filtros.estado, q, orden: 'desc', page, limit: 20 }),
    [filtros.desde, filtros.hasta, filtros.estado, q, page],
    { enabled: !rangoInvalido },
  );

  const set = <K extends keyof Filtros>(k: K, v: Filtros[K]) => setFiltros((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4">
      <form role="search" onSubmit={(e) => e.preventDefault()} className="card grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Cliente">
          {(a) => (
            <Input {...a} type="search" placeholder="Nombre o teléfono" value={filtros.q} onChange={(e) => set('q', e.target.value)} />
          )}
        </Field>
        <Field label="Estado">
          {(a) => (
            <Select {...a} value={filtros.estado} onChange={(e) => set('estado', e.target.value as Filtros['estado'])}>
              <option value="">Todos</option>
              {ESTADOS_CITA.map((e) => (
                <option key={e} value={e}>
                  {ESTADO_LABEL[e]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Desde">
          {(a) => <Input {...a} type="date" value={filtros.desde} onChange={(e) => set('desde', e.target.value)} />}
        </Field>
        <Field label="Hasta" error={rangoInvalido ? 'Debe ser posterior a "Desde"' : undefined}>
          {(a) => <Input {...a} type="date" value={filtros.hasta} onChange={(e) => set('hasta', e.target.value)} />}
        </Field>
      </form>

      {error && <Alert tone="error">{error}</Alert>}

      <div className="card overflow-x-auto">
        {loading && !data ? (
          <PageLoader />
        ) : (
          <table className="w-full min-w-[40rem] text-left text-sm" aria-busy={loading}>
            <caption className="sr-only">Historial de citas</caption>
            <thead className="border-b border-stone-200 bg-stone-50 text-xs text-stone-600">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Fecha
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Cliente
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Servicios
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Profesional
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Estado
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Importe
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data?.items.length ? (
                data.items.map((c) => (
                  <tr key={c.id} className="hover:bg-stone-50">
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                      <button
                        type="button"
                        onClick={() => setDetalle(c)}
                        className="font-medium text-brand-800 hover:underline focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
                      >
                        {formatFechaCorta(c.fecha_inicio)} {formatHora(c.fecha_inicio)}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-stone-900">{c.cliente_nombre}</td>
                    <td className="max-w-56 truncate px-4 py-3 text-stone-600">{c.servicios.map((s) => s.nombre).join(', ')}</td>
                    <td className="px-4 py-3 text-stone-600">{c.empleado_nombre}</td>
                    <td className="px-4 py-3">
                      <EstadoBadge estado={c.estado} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatEuros(c.precio_total)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-stone-500">
                    No hay citas con estos filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {data && data.meta.totalPages > 1 && (
        <nav aria-label="Paginación" className="flex items-center justify-between text-sm">
          <span className="text-stone-600">
            {data.meta.total} citas · página {page} de {data.meta.totalPages}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </Button>
            <Button size="sm" variant="secondary" disabled={page >= data.meta.totalPages} onClick={() => setPage((p) => p + 1)}>
              Siguiente
            </Button>
          </div>
        </nav>
      )}

      <CitaDetalleModal cita={detalle} onClose={() => setDetalle(null)} />
    </div>
  );
}
