import { useState } from 'react';
import { useAction } from '../../hooks/useAction';
import { useAsync } from '../../hooks/useAsync';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatEuros, formatFechaCorta, formatHora, todayKey } from '../../lib/format';
import type { Cobro } from '../../lib/types';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Field, Input, Textarea } from '../ui/Field';
import { PageLoader } from '../ui/Spinner';
import { METODO_LABEL } from './NuevoCobro';

/** Cobros de un periodo. Anular (con motivo) es solo de administración: un cobro nunca se borra. */
export function ListaCobros({ puedeAnular }: { puedeAnular: boolean }) {
  const [desde, setDesde] = useState(todayKey);
  const [hasta, setHasta] = useState(todayKey);
  const [verAnulados, setVerAnulados] = useState(false);
  const [aAnular, setAAnular] = useState<Cobro | null>(null);
  const [motivo, setMotivo] = useState('');

  const rangoOk = desde <= hasta;
  const { data, loading, error, reload } = useAsync(
    () => api.cobros.list({ desde, hasta, incluir_anulados: verAnulados }),
    [desde, hasta, verAnulados],
    {
      enabled: rangoOk,
    },
  );
  const anular = useAction((id: number, m: string) => api.cobros.anular(id, m));

  const vigentes = (data ?? []).filter((c) => c.estado === 'pagado');
  const total = vigentes.reduce((t, c) => t + c.total, 0);

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-end gap-4 p-4">
        <Field label="Desde">{(a) => <Input {...a} type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />}</Field>
        <Field label="Hasta" error={rangoOk ? undefined : 'Debe ser posterior'}>
          {(a) => <Input {...a} type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />}
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-brand-700"
            checked={verAnulados}
            onChange={(e) => setVerAnulados(e.target.checked)}
          />
          Ver anulados
        </label>
        <p className="ml-auto pb-2 text-sm text-stone-600">
          {vigentes.length} cobro(s) · <strong className="text-lg text-stone-900 tabular-nums">{formatEuros(total)}</strong>
        </p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <div className="card overflow-x-auto">
        {loading && !data ? (
          <PageLoader />
        ) : (
          <table className="w-full min-w-[44rem] text-left text-sm">
            <caption className="sr-only">Cobros del periodo</caption>
            <thead className="border-b border-stone-200 bg-stone-50 text-xs text-stone-600">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Fecha
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Cliente
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Concepto
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Método
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Total
                </th>
                {puedeAnular && (
                  <th scope="col" className="px-4 py-3">
                    <span className="sr-only">Acciones</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data?.length ? (
                data.map((c) => (
                  <tr key={c.id} className={cn(c.estado === 'anulado' && 'text-stone-400 line-through decoration-stone-300')}>
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                      {formatFechaCorta(c.fecha)} {formatHora(c.fecha)}
                    </td>
                    <td className="px-4 py-3">{c.cliente_nombre ?? 'Venta sin cliente'}</td>
                    <td className="max-w-64 truncate px-4 py-3" title={c.lineas.map((l) => l.descripcion).join(', ')}>
                      {c.lineas.map((l) => (l.cantidad > 1 ? `${l.cantidad}× ${l.descripcion}` : l.descripcion)).join(', ')}
                      {c.descuento > 0 && <span className="text-stone-500"> (−{formatEuros(c.descuento)})</span>}
                    </td>
                    <td className="px-4 py-3">{METODO_LABEL[c.metodo]}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{formatEuros(c.total)}</td>
                    {puedeAnular && (
                      <td className="px-4 py-3 text-right no-underline">
                        {c.estado === 'pagado' ? (
                          <Button size="sm" variant="ghost" onClick={() => setAAnular(c)}>
                            Anular
                          </Button>
                        ) : (
                          <span className="text-xs" title={c.motivo_anulacion ?? ''}>
                            Anulado
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={puedeAnular ? 6 : 5} className="px-4 py-10 text-center text-stone-500">
                    No hay cobros en este periodo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmDialog
        open={aAnular !== null}
        title="Anular cobro"
        confirmLabel="Anular cobro"
        tone="danger"
        pending={anular.pending}
        error={anular.error}
        onCancel={() => {
          setAAnular(null);
          setMotivo('');
        }}
        onConfirm={() => {
          if (!aAnular) return;
          void anular.run(aAnular.id, motivo).then((r) => {
            if (!r) return;
            setAAnular(null);
            setMotivo('');
            reload();
          });
        }}
      >
        <p>
          Cobro de <strong>{aAnular && formatEuros(aAnular.total)}</strong>. Quedará registrado como anulado (no se borra) y se repondrá el
          stock de los productos.
        </p>
        <Field label="Motivo" required>
          {(a) => <Textarea {...a} value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} />}
        </Field>
      </ConfirmDialog>
    </div>
  );
}
