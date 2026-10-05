/**
 * Cobro de una cita completada (?cita=ID) o venta suelta (productos y servicios).
 */
import { useState } from 'react';
import type { ClienteSeleccionado } from '../../hooks/useCitaForm';
import { useNuevoCobro } from '../../hooks/useNuevoCobro';
import { formatEuros, formatFecha, formatHora } from '../../lib/format';
import { METODOS_PAGO, type MetodoPago } from '../../lib/types';
import { ClientPicker } from '../clientes/ClientPicker';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Field, Input, Select } from '../ui/Field';
import { PageLoader } from '../ui/Spinner';

export const METODO_LABEL: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  bizum: 'Bizum',
  transferencia: 'Transferencia',
  otro: 'Otro',
};

export function NuevoCobro({ citaId, onCobrado }: { citaId: number | null; onCobrado: () => void }) {
  const c = useNuevoCobro(citaId);
  const [cliente, setCliente] = useState<ClienteSeleccionado | null>(null);

  if (c.cargando) return <PageLoader />;
  if (c.errorCarga) return <Alert tone="error">{c.errorCarga}</Alert>;

  if (c.cobrado) {
    return (
      <div className="card mx-auto max-w-md p-6 text-center">
        <div
          aria-hidden="true"
          className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-emerald-100 text-2xl text-emerald-700"
        >
          ✓
        </div>
        <h2 className="font-display text-xl font-semibold text-stone-900">Cobro registrado</h2>
        <p className="mt-1 text-sm text-stone-600">
          {formatEuros(c.cobrado.total)} · {METODO_LABEL[c.cobrado.metodo]}
          {c.cobrado.cliente_nombre && ` · ${c.cobrado.cliente_nombre}`}
        </p>
        <ul className="mt-4 space-y-1 text-left text-sm">
          {c.cobrado.lineas.map((l) => (
            <li key={l.id} className="flex justify-between">
              <span>
                {l.cantidad > 1 && `${l.cantidad} × `}
                {l.descripcion}
              </span>
              <span className="tabular-nums">{formatEuros(l.cantidad * l.precio_unitario)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex justify-center gap-2">
          <a
            href="/"
            className="inline-flex items-center rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-50"
          >
            Volver a la agenda
          </a>
          <Button onClick={onCobrado}>Ver cobros del día</Button>
        </div>
      </div>
    );
  }

  const cita = c.cita.data;
  if (cita && cita.cobrada) return <Alert tone="info">Esta cita ya está cobrada.</Alert>;
  if (cita && cita.estado !== 'completada') {
    return <Alert tone="info">Solo se pueden cobrar citas completadas. Márcala como completada en la agenda primero.</Alert>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-5">
        <section className="card space-y-3 p-5">
          <h2 className="font-display text-lg font-semibold text-stone-900">{cita ? 'Cita' : 'Cliente (opcional)'}</h2>
          {cita ? (
            <p className="text-sm text-stone-700">
              <strong className="text-stone-900">{cita.cliente_nombre}</strong> ·{' '}
              <span className="inline-block first-letter:uppercase">{formatFecha(cita.fecha_inicio)}</span> {formatHora(cita.fecha_inicio)}{' '}
              · con {cita.empleado_nombre}
            </p>
          ) : (
            <ClientPicker
              value={cliente}
              onChange={(cl) => {
                setCliente(cl);
                c.setClienteId(cl?.id ?? null);
              }}
            />
          )}
        </section>

        <section className="card space-y-4 p-5" aria-labelledby="titulo-anadir">
          <h2 id="titulo-anadir" className="font-display text-lg font-semibold text-stone-900">
            Añadir al ticket
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Producto">
              {(a) => (
                <Select
                  {...a}
                  value=""
                  onChange={(e) => {
                    const p = c.productos.find((x) => x.id === Number(e.target.value));
                    if (p) c.agregarProducto(p);
                  }}
                >
                  <option value="">Selecciona un producto…</option>
                  {c.productos.map((p) => (
                    <option key={p.id} value={p.id} disabled={p.stock === 0}>
                      {p.nombre} · {formatEuros(p.precio)} {p.stock === 0 ? '(sin stock)' : `(${p.stock} en stock)`}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Servicio adicional">
              {(a) => (
                <Select
                  {...a}
                  value=""
                  onChange={(e) => {
                    const s = c.servicios.find((x) => x.id === Number(e.target.value));
                    if (s) c.agregarServicio(s);
                  }}
                >
                  <option value="">Selecciona un servicio…</option>
                  {c.servicios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre} · {formatEuros(s.precio)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        </section>
      </div>

      <aside className="lg:sticky lg:top-10 lg:self-start">
        <div className="card space-y-4 p-5">
          <h2 className="font-display text-lg font-semibold text-stone-900">Ticket</h2>
          {c.lineas.length === 0 ? (
            <p className="text-sm text-stone-500">Añade productos o servicios.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {c.lineas.map((l) => (
                <li key={l.clave} className="flex items-center gap-2">
                  <span className="flex-1">{l.descripcion}</span>
                  {l.deCita ? (
                    <span className="w-14 text-center text-stone-500">1</span>
                  ) : (
                    <input
                      type="number"
                      min={1}
                      max={99}
                      aria-label={`Cantidad de ${l.descripcion}`}
                      className="control w-14 px-1 py-1 text-center"
                      value={l.cantidad}
                      onChange={(e) => c.cambiarCantidad(l.clave, Number(e.target.value))}
                    />
                  )}
                  <span className="w-16 text-right tabular-nums">{formatEuros(l.cantidad * l.precio)}</span>
                  {!l.deCita && (
                    <button
                      type="button"
                      aria-label={`Quitar ${l.descripcion}`}
                      onClick={() => c.quitar(l.clave)}
                      className="text-stone-400 hover:text-red-700"
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-3 border-t border-stone-200 pt-3">
            <Field label="Descuento (€)">
              {(a) => (
                <Input
                  {...a}
                  type="number"
                  min={0}
                  step="0.01"
                  max={c.subtotal}
                  value={c.descuento}
                  onChange={(e) => c.setDescuento(Math.max(0, Number(e.target.value)))}
                />
              )}
            </Field>
            <Field label="Método de pago">
              {(a) => (
                <Select {...a} value={c.metodo} onChange={(e) => c.setMetodo(e.target.value as MetodoPago)}>
                  {METODOS_PAGO.map((m) => (
                    <option key={m} value={m}>
                      {METODO_LABEL[m]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Notas (opcional)">
              {(a) => <Input {...a} maxLength={500} value={c.notas} onChange={(e) => c.setNotas(e.target.value)} />}
            </Field>
          </div>

          <div className="flex items-baseline justify-between border-t border-stone-200 pt-3">
            <span className="text-sm font-medium text-stone-700">Total</span>
            <span className="text-2xl font-semibold text-stone-900 tabular-nums">{formatEuros(c.total)}</span>
          </div>
          {c.descuento > c.subtotal && <p className="text-xs text-red-700">El descuento no puede superar el importe.</p>}
          {c.error && <Alert tone="error">{c.error}</Alert>}
          <Button
            className="w-full"
            loading={c.guardando}
            disabled={c.lineas.length === 0 || c.descuento > c.subtotal}
            onClick={() => void c.cobrar()}
          >
            Cobrar {formatEuros(c.total)}
          </Button>
        </div>
      </aside>
    </div>
  );
}
