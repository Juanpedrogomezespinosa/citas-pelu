import { useEffect, useState, type SubmitEvent } from 'react';
import { useAction } from '../../hooks/useAction';
import { useAsync } from '../../hooks/useAsync';
import { api, type ProductoInput } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatEuros } from '../../lib/format';
import type { Producto } from '../../lib/types';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Field, Input, Textarea } from '../ui/Field';
import { Modal } from '../ui/Modal';
import { PageLoader } from '../ui/Spinner';

const STOCK_BAJO = 3;

/** Productos de venta y su stock. Recepción consulta; administración edita. */
export function Productos({ editable }: { editable: boolean }) {
  const { data, loading, error, reload } = useAsync(() => api.productos.list(true), []);
  const [editando, setEditando] = useState<Producto | 'nuevo' | null>(null);

  return (
    <div className="space-y-4">
      {editable && (
        <div className="flex justify-end">
          <Button onClick={() => setEditando('nuevo')}>Nuevo producto</Button>
        </div>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      <div className="card overflow-x-auto">
        {loading && !data ? (
          <PageLoader />
        ) : (
          <table className="w-full min-w-[32rem] text-left text-sm">
            <caption className="sr-only">Productos</caption>
            <thead className="border-b border-stone-200 bg-stone-50 text-xs text-stone-600">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Producto
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Precio
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Stock
                </th>
                {editable && (
                  <th scope="col" className="px-4 py-3">
                    <span className="sr-only">Acciones</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data?.map((p) => (
                <tr key={p.id} className={p.activo ? '' : 'text-stone-400'}>
                  <td className="px-4 py-3">
                    <span className="font-medium">{p.nombre}</span>
                    {!p.activo && <span className="ml-2 text-xs">(retirado)</span>}
                    {p.descripcion && <span className="block text-xs text-stone-500">{p.descripcion}</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatEuros(p.precio)}</td>
                  <td
                    className={cn('px-4 py-3 text-right tabular-nums', p.activo && p.stock <= STOCK_BAJO && 'font-semibold text-amber-800')}
                  >
                    {p.stock}
                    {p.activo && p.stock <= STOCK_BAJO && (
                      <span className="ml-1 text-xs font-normal">{p.stock === 0 ? '· agotado' : '· reponer'}</span>
                    )}
                  </td>
                  {editable && (
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditando(p)}>
                        Editar
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {editable && (
        <ProductoModal
          producto={editando}
          onClose={() => setEditando(null)}
          onSaved={() => {
            setEditando(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

const VACIO: ProductoInput = { nombre: '', descripcion: '', precio: 0, stock: 0, activo: true };

function ProductoModal({ producto, onClose, onSaved }: { producto: Producto | 'nuevo' | null; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState<ProductoInput>(VACIO);
  const guardar = useAction((input: ProductoInput) =>
    producto && producto !== 'nuevo' ? api.productos.update(producto.id, input) : api.productos.create(input),
  );

  useEffect(() => {
    guardar.reset();
    setV(producto && producto !== 'nuevo' ? { ...producto, descripcion: producto.descripcion ?? '' } : VACIO);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [producto]);

  const set = <K extends keyof ProductoInput>(k: K, valor: ProductoInput[K]) => setV((x) => ({ ...x, [k]: valor }));

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await guardar.run(v)) onSaved();
  }

  return (
    <Modal open={producto !== null} onClose={onClose}>
      <Modal.Header>{producto === 'nuevo' ? 'Nuevo producto' : 'Editar producto'}</Modal.Header>
      <form onSubmit={onSubmit} noValidate>
        <Modal.Body className="grid gap-4 sm:grid-cols-2">
          {guardar.error && (
            <Alert tone="error" className="sm:col-span-2">
              {guardar.error}
            </Alert>
          )}
          <Field label="Nombre" required error={guardar.fieldErrors['nombre']} className="sm:col-span-2">
            {(a) => <Input {...a} value={v.nombre} maxLength={120} onChange={(e) => set('nombre', e.target.value)} />}
          </Field>
          <Field label="Precio (€)" required error={guardar.fieldErrors['precio']}>
            {(a) => (
              <Input {...a} type="number" min={0} step="0.01" value={v.precio} onChange={(e) => set('precio', Number(e.target.value))} />
            )}
          </Field>
          <Field label="Stock" required error={guardar.fieldErrors['stock']} hint="Unidades disponibles">
            {(a) => <Input {...a} type="number" min={0} step={1} value={v.stock} onChange={(e) => set('stock', Number(e.target.value))} />}
          </Field>
          <Field label="Descripción" className="sm:col-span-2">
            {(a) => <Textarea {...a} value={v.descripcion} maxLength={500} onChange={(e) => set('descripcion', e.target.value)} />}
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-brand-700"
              checked={v.activo}
              onChange={(e) => set('activo', e.target.checked)}
            />
            A la venta
          </label>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={guardar.pending}>
            Guardar
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
