/**
 * Catálogo de servicios (solo administración). Cambiar precio o duración no
 * altera las citas ya reservadas: cada cita guarda su propia copia.
 */
import { useEffect, useState, type SubmitEvent } from 'react';
import { useAction } from '../../hooks/useAction';
import { useAsync } from '../../hooks/useAsync';
import { api, type ServicioInput } from '../../lib/api';
import { formatDuracion, formatEuros } from '../../lib/format';
import { CATEGORIAS_SERVICIO, type Servicio } from '../../lib/types';
import { AuthGate } from '../auth/AuthGate';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Field, Input, Select, Textarea } from '../ui/Field';
import { Modal } from '../ui/Modal';
import { PageLoader } from '../ui/Spinner';

export function GestionServicios() {
  return (
    <AuthGate roles={['admin']}>
      <Servicios />
    </AuthGate>
  );
}

const CATEGORIA_LABEL: Record<string, string> = {
  corte: 'Corte',
  color: 'Color',
  tratamiento: 'Tratamientos',
  peinado: 'Peinados',
  barberia: 'Barbería',
  otros: 'Otros',
};

function Servicios() {
  const { data, loading, error, reload } = useAsync(() => api.servicios.list(true), []);
  const [editando, setEditando] = useState<Servicio | 'nuevo' | null>(null);

  const porCategoria = Map.groupBy(data ?? [], (s) => s.categoria);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditando('nuevo')}>Nuevo servicio</Button>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {loading && !data ? (
        <PageLoader />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {[...porCategoria].map(([categoria, servicios]) => (
            <section key={categoria} className="card p-4" aria-labelledby={`cat-${categoria}`}>
              <h2 id={`cat-${categoria}`} className="mb-2 text-xs font-semibold tracking-wide text-brand-800 uppercase">
                {CATEGORIA_LABEL[categoria] ?? categoria}
              </h2>
              <ul className="divide-y divide-stone-100">
                {servicios.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                    <div className={s.activo ? '' : 'opacity-50'}>
                      <p className="text-sm font-medium text-stone-900">
                        {s.nombre} {!s.activo && <span className="text-xs font-normal">(inactivo)</span>}
                      </p>
                      <p className="text-xs text-stone-500">
                        {formatDuracion(s.duracion_minutos)} · {formatEuros(s.precio)}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setEditando(s)}>
                      Editar
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <ServicioModal
        servicio={editando}
        onClose={() => setEditando(null)}
        onSaved={() => {
          setEditando(null);
          reload();
        }}
      />
    </div>
  );
}

const VACIO: ServicioInput = { nombre: '', descripcion: '', categoria: 'corte', duracion_minutos: 30, precio: 0, activo: true };

function ServicioModal({ servicio, onClose, onSaved }: { servicio: Servicio | 'nuevo' | null; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState<ServicioInput>(VACIO);
  const guardar = useAction((input: ServicioInput) =>
    servicio && servicio !== 'nuevo' ? api.servicios.update(servicio.id, input) : api.servicios.create(input),
  );

  useEffect(() => {
    guardar.reset();
    setV(servicio && servicio !== 'nuevo' ? { ...servicio, descripcion: servicio.descripcion ?? '' } : VACIO);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servicio]);

  const set = <K extends keyof ServicioInput>(k: K, valor: ServicioInput[K]) => setV((x) => ({ ...x, [k]: valor }));

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await guardar.run(v)) onSaved();
  }

  return (
    <Modal open={servicio !== null} onClose={onClose}>
      <Modal.Header>{servicio === 'nuevo' ? 'Nuevo servicio' : 'Editar servicio'}</Modal.Header>
      <form onSubmit={onSubmit} noValidate>
        <Modal.Body className="grid gap-4 sm:grid-cols-2">
          {guardar.error && (
            <Alert tone="error" className="sm:col-span-2">
              {guardar.error}
            </Alert>
          )}
          <Field label="Nombre" error={guardar.fieldErrors['nombre']} required className="sm:col-span-2">
            {(a) => <Input {...a} value={v.nombre} maxLength={100} onChange={(e) => set('nombre', e.target.value)} />}
          </Field>
          <Field label="Categoría">
            {(a) => (
              <Select {...a} value={v.categoria} onChange={(e) => set('categoria', e.target.value)}>
                {CATEGORIAS_SERVICIO.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORIA_LABEL[c]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Duración (minutos)" error={guardar.fieldErrors['duracion_minutos']} required>
            {(a) => (
              <Input
                {...a}
                type="number"
                min={5}
                max={600}
                step={5}
                value={v.duracion_minutos}
                onChange={(e) => set('duracion_minutos', Number(e.target.value))}
              />
            )}
          </Field>
          <Field label="Precio (€)" error={guardar.fieldErrors['precio']} required>
            {(a) => (
              <Input {...a} type="number" min={0} step="0.01" value={v.precio} onChange={(e) => set('precio', Number(e.target.value))} />
            )}
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input
              type="checkbox"
              checked={v.activo}
              onChange={(e) => set('activo', e.target.checked)}
              className="size-4 accent-brand-700"
            />
            Disponible para reservar
          </label>
          <Field label="Descripción" error={guardar.fieldErrors['descripcion']} className="sm:col-span-2">
            {(a) => <Textarea {...a} value={v.descripcion} maxLength={500} onChange={(e) => set('descripcion', e.target.value)} />}
          </Field>
          {servicio !== 'nuevo' && (
            <p className="text-xs text-stone-500 sm:col-span-2">Los cambios de precio o duración solo afectan a las citas nuevas.</p>
          )}
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
