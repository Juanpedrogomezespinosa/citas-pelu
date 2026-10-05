/**
 * Agenda del salón: calendario mensual + citas del día en tres vistas
 * (lista, por profesional y semana), con acciones rápidas. Isla principal de
 * la página (client:load).
 */
import { useMemo, useState } from 'react';
import { useAgenda } from '../../hooks/useAgenda';
import { useCatalogo } from '../../hooks/useCatalogo';
import { useCitaAcciones, type AccionCita } from '../../hooks/useCitaAcciones';
import { useUsuario } from '../../hooks/useSession';
import { cn } from '../../lib/cn';
import { formatEuros, formatFecha, fromDateKey, todayKey } from '../../lib/format';
import { tieneRol } from '../../lib/session';
import type { Bloqueo, Cita } from '../../lib/types';
import { AuthGate } from '../auth/AuthGate';
import { Calendar } from '../calendar/Calendar';
import { Alert } from '../ui/Alert';
import { Modal } from '../ui/Modal';
import { PageLoader } from '../ui/Spinner';
import { AccionCitaDialog } from './AccionCitaDialog';
import { AgendaProfesionales } from './AgendaProfesionales';
import { AgendaSemana } from './AgendaSemana';
import { CitaCard } from './CitaCard';

export function Dashboard() {
  return (
    <AuthGate>
      <Agenda />
    </AuthGate>
  );
}

type Vista = 'lista' | 'profesionales' | 'semana';
const VISTAS: { id: Vista; label: string }[] = [
  { id: 'lista', label: 'Lista' },
  { id: 'profesionales', label: 'Por profesional' },
  { id: 'semana', label: 'Semana' },
];

const ETIQUETA_BLOQUEO = {
  vacaciones: 'Vacaciones',
  festivo: 'Festivo',
  baja: 'Baja',
  formacion: 'Formación',
  otro: 'No disponible',
} as const;

function Agenda() {
  const usuario = useUsuario();
  const [dia, setDia] = useState(todayKey);
  const [mes, setMes] = useState(() => fromDateKey(todayKey()));
  const [vista, setVista] = useState<Vista>('lista');
  const [citaAbierta, setCitaAbierta] = useState<Cita | null>(null);

  const agenda = useAgenda(mes);
  const { empleados } = useCatalogo();
  const acciones = useCitaAcciones(agenda.reload);

  const citasDelDia = agenda.porDia.get(dia) ?? [];
  const bloqueosDelDia = agenda.bloqueosDelDia(dia);
  const marcadores = useMemo(
    () => new Map([...agenda.porDia].map(([key, citas]) => [key, citas.filter((c) => c.estado !== 'cancelada').length])),
    [agenda.porDia],
  );

  const elegirDia = (key: string) => {
    setDia(key);
    const d = fromDateKey(key);
    if (d.getMonth() !== mes.getMonth() || d.getFullYear() !== mes.getFullYear()) setMes(new Date(d.getFullYear(), d.getMonth(), 1));
  };
  const accionDesdeModal = (accion: AccionCita, cita: Cita) => {
    setCitaAbierta(null);
    acciones.solicitar(accion, cita);
  };

  return (
    <div className={cn('grid gap-6', vista === 'lista' && 'lg:grid-cols-[20rem_1fr]')}>
      {vista === 'lista' && (
        <div className="space-y-4">
          <Calendar value={dia} onChange={elegirDia} month={mes} onMonthChange={setMes} marcadores={marcadores} />
          {tieneRol(usuario, 'admin', 'recepcion') && (
            <a
              href="/citas/nueva"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-800 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              + Nueva cita
            </a>
          )}
        </div>
      )}

      <section aria-labelledby="titulo-dia" className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Día anterior"
              onClick={() => elegirDia(desplazar(dia, vista === 'semana' ? -7 : -1))}
              className={BOTON_NAV}
            >
              ‹
            </button>
            <h2 id="titulo-dia" className="font-display text-xl font-semibold text-stone-900 first-letter:uppercase">
              {vista === 'semana' ? `Semana del ${formatFecha(lunesDe(dia))}` : formatFecha(fromDateKey(dia))}
            </h2>
            <button
              type="button"
              aria-label="Día siguiente"
              onClick={() => elegirDia(desplazar(dia, vista === 'semana' ? 7 : 1))}
              className={BOTON_NAV}
            >
              ›
            </button>
            {dia !== todayKey() && (
              <button type="button" onClick={() => elegirDia(todayKey())} className="text-sm font-medium text-brand-700 hover:underline">
                Hoy
              </button>
            )}
          </div>
          <div role="tablist" aria-label="Vista de la agenda" className="inline-flex rounded-lg bg-stone-100 p-1">
            {VISTAS.map((v) => (
              <button
                key={v.id}
                role="tab"
                type="button"
                aria-selected={vista === v.id}
                onClick={() => setVista(v.id)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none',
                  vista === v.id ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600 hover:text-stone-900',
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {vista !== 'semana' && <ResumenDia citas={citasDelDia} />}
        {vista !== 'semana' && bloqueosDelDia.length > 0 && <AvisoBloqueos bloqueos={bloqueosDelDia} />}

        {acciones.resultado && (
          <Alert tone="success" className="flex flex-wrap items-center justify-between gap-3">
            <span>{acciones.resultado.mensaje}</span>
            <span className="flex gap-3">
              {acciones.resultado.citaParaCobrar && tieneRol(usuario, 'admin', 'recepcion') && (
                <a href={`/caja?cita=${acciones.resultado.citaParaCobrar}`} className="text-xs font-semibold underline">
                  Cobrar ahora
                </a>
              )}
              <button type="button" onClick={acciones.limpiarResultado} className="text-xs font-medium underline">
                Cerrar
              </button>
            </span>
          </Alert>
        )}
        {agenda.error && <Alert tone="error">{agenda.error}</Alert>}

        {agenda.loading && agenda.porDia.size === 0 ? (
          <PageLoader />
        ) : vista === 'profesionales' ? (
          <AgendaProfesionales
            dia={dia}
            citas={citasDelDia}
            bloqueos={bloqueosDelDia}
            empleados={empleados}
            onSeleccionar={setCitaAbierta}
          />
        ) : vista === 'semana' ? (
          <AgendaSemana
            dia={dia}
            porDia={agenda.porDia}
            bloqueosDelDia={agenda.bloqueosDelDia}
            onSeleccionarDia={elegirDia}
            onSeleccionarCita={setCitaAbierta}
          />
        ) : citasDelDia.length === 0 ? (
          <div className="card px-6 py-12 text-center">
            <p className="font-medium text-stone-800">No hay citas este día</p>
            <p className="mt-1 text-sm text-stone-500">Selecciona otro día o crea una nueva cita.</p>
          </div>
        ) : (
          <ul className="space-y-3" aria-busy={agenda.loading}>
            {citasDelDia.map((cita) => (
              <li key={cita.id}>
                <CitaCard cita={cita} onAccion={acciones.solicitar} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal open={citaAbierta !== null} onClose={() => setCitaAbierta(null)} size="lg">
        {citaAbierta && (
          <>
            <Modal.Header>Cita de {citaAbierta.cliente_nombre}</Modal.Header>
            <Modal.Body>
              <CitaCard cita={citaAbierta} onAccion={accionDesdeModal} embebida />
            </Modal.Body>
          </>
        )}
      </Modal>

      <AccionCitaDialog
        solicitud={acciones.pendiente}
        pending={acciones.pending}
        error={acciones.error}
        onConfirm={(datos) => void acciones.confirmarPendiente(datos)}
        onCancel={acciones.cancelarSolicitud}
      />
    </div>
  );
}

const BOTON_NAV =
  'grid size-8 place-items-center rounded-md text-lg text-stone-600 hover:bg-stone-100 hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none';

function desplazar(key: string, dias: number): string {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function lunesDe(key: string): Date {
  const d = fromDateKey(key);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function AvisoBloqueos({ bloqueos }: { bloqueos: Bloqueo[] }) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Bloqueos del día">
      {bloqueos.map((b) => (
        <li key={b.id} className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-700">
          {ETIQUETA_BLOQUEO[b.tipo]} · {b.empleado_nombre ?? 'Todo el salón'}
          {b.motivo ? ` (${b.motivo})` : ''}
        </li>
      ))}
    </ul>
  );
}

function ResumenDia({ citas }: { citas: Cita[] }) {
  const activas = citas.filter((c) => c.estado !== 'cancelada');
  const stats = [
    { label: 'Citas', value: String(activas.length) },
    { label: 'Confirmadas', value: String(activas.filter((c) => c.estado === 'confirmada').length) },
    { label: 'Pendientes', value: String(activas.filter((c) => c.estado === 'pendiente').length) },
    {
      label: 'Ingresos previstos',
      value: formatEuros(activas.filter((c) => c.estado !== 'no_asistio').reduce((t, c) => t + c.precio_total, 0)),
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="card px-4 py-3">
          <dt className="text-xs text-stone-500">{s.label}</dt>
          <dd className="mt-0.5 text-xl font-semibold text-stone-900 tabular-nums">{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}
