/**
 * Equipo: profesionales, su horario semanal y sus bloqueos de agenda.
 * Administración edita fichas y horarios; recepción gestiona bloqueos.
 */
import { useCallback, useEffect, useState, type SubmitEvent } from 'react';
import { useAction } from '../../hooks/useAction';
import { useAsync } from '../../hooks/useAsync';
import { useUsuario } from '../../hooks/useSession';
import { api, type EmpleadoInput } from '../../lib/api';
import { cn } from '../../lib/cn';
import { nombreCompleto } from '../../lib/format';
import { tieneRol } from '../../lib/session';
import type { EmpleadoDetalle } from '../../lib/types';
import { AuthGate } from '../auth/AuthGate';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { CitasAfectadas, citasDeError } from '../ui/CitasAfectadas';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Field, Input } from '../ui/Field';
import { PageLoader } from '../ui/Spinner';
import { BloqueosAgenda } from './BloqueosAgenda';
import { HorarioSemanal } from './HorarioSemanal';

export function GestionEquipo() {
  return (
    <AuthGate roles={['admin', 'recepcion']}>
      <Equipo />
    </AuthGate>
  );
}

type Seleccion = { modo: 'ficha'; id: number } | { modo: 'nuevo' } | null;

function Equipo() {
  const usuario = useUsuario();
  const esAdmin = tieneRol(usuario, 'admin');
  const lista = useAsync(() => api.empleados.list(true), []);
  const [seleccion, setSeleccion] = useState<Seleccion>(null);

  useEffect(() => {
    const primero = lista.data?.find((e) => e.activo);
    if (!seleccion && primero) setSeleccion({ modo: 'ficha', id: primero.id });
  }, [lista.data, seleccion]);

  const { reload } = lista;
  const onCambio = useCallback(
    (id?: number) => {
      reload();
      if (id) setSeleccion({ modo: 'ficha', id });
    },
    [reload],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <section aria-label="Profesionales" className="space-y-3">
        {esAdmin && (
          <Button className="w-full" onClick={() => setSeleccion({ modo: 'nuevo' })}>
            Nuevo profesional
          </Button>
        )}
        {lista.error && <Alert tone="error">{lista.error}</Alert>}
        <ul className="card divide-y divide-stone-100 overflow-hidden">
          {lista.data?.map((e) => {
            const activo = seleccion?.modo === 'ficha' && seleccion.id === e.id;
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => setSeleccion({ modo: 'ficha', id: e.id })}
                  aria-current={activo || undefined}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-3 text-left focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none focus-visible:ring-inset',
                    activo ? 'bg-brand-50' : 'hover:bg-stone-50',
                    !e.activo && 'opacity-50',
                  )}
                >
                  <span aria-hidden="true" className="size-3 rounded-full" style={{ backgroundColor: e.color_calendario }} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-stone-900">{nombreCompleto(e)}</span>
                    <span className="block truncate text-xs text-stone-500">{e.activo ? (e.especialidad ?? '') : 'De baja'}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-label="Detalle del profesional" className="card min-h-96 p-5 sm:p-6">
        {seleccion?.modo === 'nuevo' && <FormEmpleado empleado={null} onSaved={(e) => onCambio(e.id)} />}
        {seleccion?.modo === 'ficha' && <DetalleEmpleado key={seleccion.id} id={seleccion.id} esAdmin={esAdmin} onCambio={onCambio} />}
        {!seleccion && (lista.loading ? <PageLoader /> : <p className="text-sm text-stone-500">Selecciona un profesional.</p>)}
      </section>
    </div>
  );
}

type Pestana = 'horario' | 'bloqueos' | 'ficha';

function DetalleEmpleado({ id, esAdmin, onCambio }: { id: number; esAdmin: boolean; onCambio: (id?: number) => void }) {
  const { data: empleado, loading, error, reload } = useAsync(() => api.empleados.get(id), [id]);
  const [pestana, setPestana] = useState<Pestana>('horario');
  const [confirmarBaja, setConfirmarBaja] = useState(false);
  const baja = useAction(async (cancelar: boolean) => {
    await api.empleados.desactivar(id, cancelar);
    return true as const; // DELETE responde 204 sin cuerpo: true = éxito
  });
  const alta = useAction(() => api.empleados.reactivar(id));

  if (loading && !empleado) return <PageLoader />;
  if (error || !empleado) return <Alert tone="error">{error ?? 'No encontrado'}</Alert>;

  const pestanas: { id: Pestana; label: string }[] = [
    { id: 'horario', label: 'Horario semanal' },
    { id: 'bloqueos', label: 'Vacaciones y bloqueos' },
    ...(esAdmin ? [{ id: 'ficha' as const, label: 'Ficha' }] : []),
  ];
  const afectadas = citasDeError(baja.errorDetails);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="size-4 rounded-full" style={{ backgroundColor: empleado.color_calendario }} />
          <div>
            <h2 className="font-display text-xl font-semibold text-stone-900">{nombreCompleto(empleado)}</h2>
            <p className="text-sm text-stone-500">{empleado.activo ? (empleado.especialidad ?? 'Profesional') : 'De baja'}</p>
          </div>
        </div>
        {esAdmin &&
          (empleado.activo ? (
            <Button variant="ghost" className="text-red-700 hover:bg-red-50" onClick={() => setConfirmarBaja(true)}>
              Dar de baja
            </Button>
          ) : (
            <Button variant="secondary" loading={alta.pending} onClick={() => void alta.run().then(() => onCambio(id))}>
              Reactivar
            </Button>
          ))}
      </div>

      <div role="tablist" aria-label="Secciones" className="mb-5 flex gap-1 overflow-x-auto border-b border-stone-200">
        {pestanas.map((p) => (
          <button
            key={p.id}
            role="tab"
            type="button"
            aria-selected={pestana === p.id}
            onClick={() => setPestana(p.id)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none',
              pestana === p.id ? 'border-brand-700 text-brand-800' : 'border-transparent text-stone-600 hover:text-stone-900',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {pestana === 'horario' && <HorarioSemanal empleadoId={id} inicial={empleado.horarios} editable={esAdmin} onSaved={reload} />}
        {pestana === 'bloqueos' && <BloqueosAgenda empleadoId={id} puedeGestionar />}
        {pestana === 'ficha' && <FormEmpleado empleado={empleado} onSaved={() => onCambio(id)} />}
      </div>

      <ConfirmDialog
        open={confirmarBaja}
        title="Dar de baja al profesional"
        confirmLabel={afectadas.length ? `Cancelar ${afectadas.length} cita(s) y dar de baja` : 'Dar de baja'}
        tone="danger"
        pending={baja.pending}
        error={baja.error}
        onCancel={() => {
          setConfirmarBaja(false);
          baja.reset();
        }}
        onConfirm={() =>
          void baja.run(afectadas.length > 0).then((ok) => {
            if (!ok) return; // si hay citas pendientes, el diálogo las muestra y pide confirmar su cancelación
            setConfirmarBaja(false);
            onCambio(id);
          })
        }
      >
        <p>Dejará de aparecer en la agenda y no se podrán reservar citas con {empleado.nombre}.</p>
        {afectadas.length > 0 && (
          <>
            <p className="font-medium text-stone-900">Lo ideal es reprogramar estas citas con otro profesional antes de continuar:</p>
            <CitasAfectadas citas={afectadas} />
            <p>Si continúas, se cancelarán y se avisará a los clientes por WhatsApp.</p>
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}

const VACIO: EmpleadoInput = { nombre: '', apellidos: '', telefono: '', email: '', especialidad: '', color_calendario: '#9F1239' };

function FormEmpleado({ empleado, onSaved }: { empleado: EmpleadoDetalle | null; onSaved: (e: EmpleadoDetalle) => void }) {
  const [v, setV] = useState<EmpleadoInput>(
    empleado
      ? {
          nombre: empleado.nombre,
          apellidos: empleado.apellidos ?? '',
          telefono: empleado.telefono ?? '',
          email: empleado.email ?? '',
          especialidad: empleado.especialidad ?? '',
          color_calendario: empleado.color_calendario,
        }
      : VACIO,
  );
  const [ok, setOk] = useState(false);
  const guardar = useAction((input: EmpleadoInput) => (empleado ? api.empleados.update(empleado.id, input) : api.empleados.create(input)));
  const set = <K extends keyof EmpleadoInput>(k: K, valor: EmpleadoInput[K]) => {
    setOk(false);
    setV((x) => ({ ...x, [k]: valor }));
  };

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const r = await guardar.run(v);
    if (r) {
      setOk(true);
      onSaved(r);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {!empleado && <h2 className="font-display text-xl font-semibold text-stone-900">Nuevo profesional</h2>}
      {guardar.error && <Alert tone="error">{guardar.error}</Alert>}
      {ok && <Alert tone="success">Ficha guardada.</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" error={guardar.fieldErrors['nombre']} required>
          {(a) => <Input {...a} value={v.nombre} maxLength={80} onChange={(e) => set('nombre', e.target.value)} />}
        </Field>
        <Field label="Apellidos" error={guardar.fieldErrors['apellidos']}>
          {(a) => <Input {...a} value={v.apellidos} maxLength={120} onChange={(e) => set('apellidos', e.target.value)} />}
        </Field>
        <Field label="Teléfono" error={guardar.fieldErrors['telefono']}>
          {(a) => <Input {...a} type="tel" value={v.telefono} onChange={(e) => set('telefono', e.target.value)} />}
        </Field>
        <Field label="Email" error={guardar.fieldErrors['email']}>
          {(a) => <Input {...a} type="email" value={v.email} onChange={(e) => set('email', e.target.value)} />}
        </Field>
        <Field label="Especialidad" error={guardar.fieldErrors['especialidad']}>
          {(a) => <Input {...a} value={v.especialidad} maxLength={150} onChange={(e) => set('especialidad', e.target.value)} />}
        </Field>
        <Field label="Color en la agenda" error={guardar.fieldErrors['color_calendario']}>
          {(a) => (
            <Input
              {...a}
              type="color"
              className="h-10 p-1"
              value={v.color_calendario}
              onChange={(e) => set('color_calendario', e.target.value.toUpperCase())}
            />
          )}
        </Field>
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={guardar.pending}>
          {empleado ? 'Guardar cambios' : 'Crear profesional'}
        </Button>
      </div>
    </form>
  );
}
