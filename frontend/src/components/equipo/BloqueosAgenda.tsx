/**
 * Bloqueos de agenda (vacaciones, bajas, formación) de un profesional y
 * festivos de todo el salón. No se pueden crear encima de citas activas: la
 * API devuelve cuáles son para reprogramarlas antes.
 */
import { useState, type SubmitEvent } from 'react';
import { useAction } from '../../hooks/useAction';
import { useAsync } from '../../hooks/useAsync';
import { api } from '../../lib/api';
import { formatFechaCorta, formatHora, todayKey } from '../../lib/format';
import { TIPOS_BLOQUEO, type TipoBloqueo } from '../../lib/types';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { CitasAfectadas, citasDeError } from '../ui/CitasAfectadas';
import { Field, Input, Select } from '../ui/Field';
import { campo } from '../../lib/form';

const ETIQUETA: Record<TipoBloqueo, string> = {
  vacaciones: 'Vacaciones',
  festivo: 'Festivo',
  baja: 'Baja',
  formacion: 'Formación',
  otro: 'Otro',
};

function sumarDias(key: string, dias: number): string {
  const d = new Date(`${key}T00:00`);
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function BloqueosAgenda({ empleadoId, puedeGestionar }: { empleadoId: number; puedeGestionar: boolean }) {
  const hoy = todayKey();
  const lista = useAsync(() => api.bloqueos.list({ desde: hoy, hasta: sumarDias(hoy, 365), empleado_id: empleadoId }), [empleadoId]);
  const crear = useAction(api.bloqueos.create);
  const borrar = useAction(api.bloqueos.remove);

  const [tipo, setTipo] = useState<TipoBloqueo>('vacaciones');
  const [todoElSalon, setTodoElSalon] = useState(false);
  const [diaCompleto, setDiaCompleto] = useState(true);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const desde = campo(f, 'desde');
    const hasta = campo(f, 'hasta');
    const r = await crear.run({
      empleado_id: todoElSalon ? null : empleadoId,
      tipo,
      // Día completo: de las 00:00 del primer día a las 00:00 del día siguiente al último
      fecha_inicio: diaCompleto ? `${desde}T00:00` : `${desde}T${campo(f, 'hora_desde', '09:00')}`,
      fecha_fin: diaCompleto ? `${sumarDias(hasta || desde, 1)}T00:00` : `${hasta || desde}T${campo(f, 'hora_hasta', '14:00')}`,
      motivo: campo(f, 'motivo'),
    });
    if (r) {
      event.currentTarget.reset();
      lista.reload();
    }
  }

  const afectadas = citasDeError(crear.errorDetails);

  return (
    <div className="space-y-5">
      {lista.error && <Alert tone="error">{lista.error}</Alert>}
      {borrar.error && <Alert tone="error">{borrar.error}</Alert>}

      <section aria-labelledby="titulo-bloqueos">
        <h3 id="titulo-bloqueos" className="mb-2 text-sm font-semibold text-stone-800">
          Próximos bloqueos
        </h3>
        {lista.data?.length ? (
          <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
            {lista.data.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span>
                  <strong className="font-medium">{ETIQUETA[b.tipo]}</strong>
                  {b.empleado_id === null && <span className="ml-1 rounded bg-brand-50 px-1.5 text-xs text-brand-800">Todo el salón</span>}
                  <span className="block text-xs text-stone-600 tabular-nums">
                    {formatFechaCorta(b.fecha_inicio)} {formatHora(b.fecha_inicio)} → {formatFechaCorta(b.fecha_fin)}{' '}
                    {formatHora(b.fecha_fin)}
                    {b.motivo && ` · ${b.motivo}`}
                  </span>
                </span>
                {puedeGestionar && (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={borrar.pending}
                    onClick={() => void borrar.run(b.id).then(() => lista.reload())}
                  >
                    Quitar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-stone-500">{lista.loading ? 'Cargando…' : 'Sin bloqueos en los próximos 12 meses.'}</p>
        )}
      </section>

      {puedeGestionar && (
        <form
          onSubmit={onSubmit}
          noValidate
          className="space-y-4 rounded-lg border border-stone-200 p-4"
          aria-labelledby="titulo-nuevo-bloqueo"
        >
          <h3 id="titulo-nuevo-bloqueo" className="text-sm font-semibold text-stone-800">
            Bloquear agenda
          </h3>
          {crear.error && (
            <Alert tone="error">
              {crear.error}
              {afectadas.length > 0 && (
                <div className="mt-2">
                  <CitasAfectadas citas={afectadas} />
                </div>
              )}
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo">
              {(a) => (
                <Select
                  {...a}
                  value={tipo}
                  onChange={(e) => {
                    const t = e.target.value as TipoBloqueo;
                    setTipo(t);
                    if (t === 'festivo') setTodoElSalon(true);
                  }}
                >
                  {TIPOS_BLOQUEO.map((t) => (
                    <option key={t} value={t}>
                      {ETIQUETA[t]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Motivo (opcional)">{(a) => <Input {...a} name="motivo" maxLength={200} />}</Field>
            <Field label="Desde" required>
              {(a) => <Input {...a} name="desde" type="date" min={hoy} required />}
            </Field>
            <Field label="Hasta" hint="Vacío: un solo día">
              {(a) => <Input {...a} name="hasta" type="date" min={hoy} />}
            </Field>
            {!diaCompleto && (
              <>
                <Field label="Hora de inicio">
                  {(a) => <Input {...a} name="hora_desde" type="time" defaultValue="09:00" step={900} />}
                </Field>
                <Field label="Hora de fin">{(a) => <Input {...a} name="hora_hasta" type="time" defaultValue="14:00" step={900} />}</Field>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-brand-700"
                checked={diaCompleto}
                onChange={(e) => setDiaCompleto(e.target.checked)}
              />
              Días completos
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-brand-700"
                checked={todoElSalon}
                onChange={(e) => setTodoElSalon(e.target.checked)}
              />
              Afecta a todo el salón (cerrado)
            </label>
          </div>
          <div className="flex justify-end">
            <Button type="submit" loading={crear.pending}>
              Bloquear
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
