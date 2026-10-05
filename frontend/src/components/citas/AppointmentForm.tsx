/**
 * Formulario reactivo para reservar o reprogramar una cita (?id=123).
 * Flujo: cliente -> servicios -> profesional -> día -> hora libre -> revisar -> confirmar.
 */
import { useEffect, useState, type SubmitEvent } from 'react';
import { useCitaForm } from '../../hooks/useCitaForm';
import { formatDuracion, formatEuros, formatFecha, fromDateKey, todayKey } from '../../lib/format';
import { AuthGate } from '../auth/AuthGate';
import { Calendar } from '../calendar/Calendar';
import { ClientPicker } from '../clientes/ClientPicker';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Field, Select, Textarea } from '../ui/Field';
import { PageLoader } from '../ui/Spinner';
import { ServicePicker } from './ServicePicker';
import { SlotPicker } from './SlotPicker';

export function AppointmentForm() {
  return (
    <AuthGate roles={['admin', 'recepcion']}>
      <FormularioCita />
    </AuthGate>
  );
}

function leerCitaId(): number | null {
  const id = Number(new URLSearchParams(window.location.search).get('id'));
  return Number.isInteger(id) && id > 0 ? id : null;
}

function FormularioCita() {
  const [citaId] = useState(leerCitaId);
  const f = useCitaForm(citaId);
  const [mes, setMes] = useState(() => fromDateKey(f.draft.fecha));
  const empleado = f.catalogo.empleados.find((e) => e.id === f.draft.empleado_id);

  // Al reprogramar, el calendario se abre en el mes de la cita
  const fechaOriginal = f.original.data?.fecha_inicio;
  useEffect(() => {
    if (fechaOriginal) setMes(new Date(fechaOriginal));
  }, [fechaOriginal]);

  if (f.catalogo.loading || f.original.loading) return <PageLoader />;
  if (f.catalogo.error || f.original.error) return <Alert tone="error">{f.catalogo.error ?? f.original.error}</Alert>;
  if (f.guardada) return <Exito editando={citaId !== null} onOtra={f.reiniciar} />;

  const onSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    f.revisar();
  };

  const placeholderHoras = !f.draft.empleado_id
    ? 'Elige un profesional para ver las horas libres.'
    : f.duracion === 0
      ? 'Elige al menos un servicio para calcular la duración.'
      : null;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-6">
        {citaId && (
          <Alert tone="info">
            Estás reprogramando una cita. Si cambias el día, la hora o el profesional, el cliente recibirá un WhatsApp para confirmar de
            nuevo.
          </Alert>
        )}

        <section className="card space-y-3 p-5" aria-labelledby="paso-cliente">
          <h2 id="paso-cliente" className="font-display text-lg font-semibold text-stone-900">
            1. Cliente
          </h2>
          <ClientPicker value={f.cliente} onChange={f.elegirCliente} error={f.errors.cliente_id} disabled={citaId !== null} />
          {f.errors.cliente_id && <p className="text-xs text-red-700">{f.errors.cliente_id}</p>}
        </section>

        <section className="card space-y-4 p-5" aria-labelledby="paso-servicio">
          <h2 id="paso-servicio" className="font-display text-lg font-semibold text-stone-900">
            2. Servicios y profesional
          </h2>
          <ServicePicker
            servicios={f.catalogo.servicios}
            seleccionados={f.draft.servicios}
            onToggle={f.toggleServicio}
            error={f.errors.servicios}
          />
          <Field label="Profesional" error={f.errors.empleado_id} required>
            {(a11y) => (
              <Select
                {...a11y}
                value={f.draft.empleado_id ?? ''}
                onChange={(e) => f.set('empleado_id', e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Selecciona…</option>
                {f.catalogo.empleados.map((e) => (
                  <option key={e.id} value={e.id}>
                    {[e.nombre, e.apellidos].filter(Boolean).join(' ')}
                    {e.especialidad ? ` — ${e.especialidad}` : ''}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </section>

        <section className="card space-y-4 p-5" aria-labelledby="paso-fecha">
          <h2 id="paso-fecha" className="font-display text-lg font-semibold text-stone-900">
            3. Día y hora
          </h2>
          <div className="grid gap-5 md:grid-cols-[18rem_1fr]">
            <Calendar
              className="border-none p-0 shadow-none"
              value={f.draft.fecha}
              onChange={(fecha) => f.set('fecha', fecha)}
              month={mes}
              onMonthChange={setMes}
              minDate={todayKey()}
            />
            <SlotPicker
              huecos={f.huecos.data}
              loading={f.huecos.loading}
              error={f.huecos.error}
              value={f.draft.hora}
              onChange={(hora) => f.set('hora', hora)}
              placeholder={placeholderHoras}
              fieldError={f.errors.hora}
            />
          </div>
        </section>

        <section className="card p-5">
          <Field label="Notas para el equipo" hint="Visible solo en el panel. Ej.: trae foto de referencia." error={f.errors.notas}>
            {(a11y) => <Textarea {...a11y} maxLength={1000} value={f.draft.notas} onChange={(e) => f.set('notas', e.target.value)} />}
          </Field>
        </section>
      </div>

      {/* Resumen fijo en escritorio */}
      <aside className="lg:sticky lg:top-10 lg:self-start">
        <div className="card space-y-4 p-5">
          <h2 className="font-display text-lg font-semibold text-stone-900">Resumen</h2>
          <dl className="space-y-2 text-sm">
            <Fila label="Cliente" value={f.cliente?.nombre} />
            <Fila label="Profesional" value={empleado ? [empleado.nombre, empleado.apellidos].filter(Boolean).join(' ') : undefined} />
            <Fila label="Día" value={formatFecha(fromDateKey(f.draft.fecha))} />
            <Fila label="Hora" value={f.draft.hora || undefined} />
            <Fila label="Duración" value={f.duracion ? formatDuracion(f.duracion) : undefined} />
          </dl>
          {f.seleccionados.length > 0 && (
            <ul className="space-y-1 border-t border-stone-100 pt-3 text-sm">
              {f.seleccionados.map((s) => (
                <li key={s.id} className="flex justify-between gap-2">
                  <span className="text-stone-700">{s.nombre}</span>
                  <span className="text-stone-900 tabular-nums">{formatEuros(s.precio)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-baseline justify-between border-t border-stone-200 pt-3">
            <span className="text-sm font-medium text-stone-700">Total</span>
            <span className="text-xl font-semibold text-stone-900 tabular-nums">{formatEuros(f.total)}</span>
          </div>
          <Button type="submit" className="w-full">
            {citaId ? 'Revisar cambios' : 'Revisar reserva'}
          </Button>
        </div>
      </aside>

      <ConfirmDialog
        open={f.confirmando}
        title={citaId ? 'Confirmar cambios' : 'Confirmar reserva'}
        confirmLabel={citaId ? 'Guardar cambios' : 'Reservar cita'}
        pending={f.guardando}
        error={f.errorGuardar}
        onConfirm={f.confirmar}
        onCancel={f.cerrarConfirmacion}
      >
        <p>
          <strong className="text-stone-900">{f.cliente?.nombre}</strong> con {empleado?.nombre}
        </p>
        <p>
          {formatFecha(fromDateKey(f.draft.fecha))} a las <strong>{f.draft.hora}</strong> ({formatDuracion(f.duracion)})
        </p>
        <p className="text-stone-600">
          {f.seleccionados.map((s) => s.nombre).join(', ')} · <strong>{formatEuros(f.total)}</strong>
        </p>
        <p className="text-stone-600">El cliente recibirá la {citaId ? 'actualización' : 'confirmación'} por WhatsApp.</p>
      </ConfirmDialog>
    </form>
  );
}

function Fila({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-stone-500">{label}</dt>
      <dd className="text-right font-medium text-stone-900 first-letter:uppercase">{value ?? '—'}</dd>
    </div>
  );
}

function Exito({ editando, onOtra }: { editando: boolean; onOtra: () => void }) {
  return (
    <div className="card mx-auto max-w-lg px-6 py-10 text-center">
      <div
        aria-hidden="true"
        className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-emerald-100 text-2xl text-emerald-700"
      >
        ✓
      </div>
      <h2 className="font-display text-xl font-semibold text-stone-900">{editando ? 'Cita actualizada' : 'Cita reservada'}</h2>
      <p className="mt-2 text-sm text-stone-600">Hemos enviado el WhatsApp al cliente para que confirme su asistencia.</p>
      <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
        <a
          href="/"
          className="inline-flex items-center justify-center rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          Ver agenda
        </a>
        {!editando && (
          <Button variant="secondary" onClick={onOtra}>
            Reservar otra
          </Button>
        )}
      </div>
    </div>
  );
}
