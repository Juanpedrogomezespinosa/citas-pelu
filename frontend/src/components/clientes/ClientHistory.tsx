import { useAsync } from '../../hooks/useAsync';
import { api } from '../../lib/api';
import { formatEuros, formatFechaCorta, formatHora } from '../../lib/format';
import { Alert } from '../ui/Alert';
import { EstadoBadge } from '../ui/EstadoBadge';
import { PageLoader } from '../ui/Spinner';

/** Historial de servicios del cliente con estadísticas y notas técnicas */
export function ClientHistory({ clienteId }: { clienteId: number }) {
  const { data, loading, error } = useAsync(() => api.clientes.historial(clienteId), [clienteId]);

  if (loading) return <PageLoader />;
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return null;

  const { estadisticas: e, visitas } = data;
  const stats = [
    { label: 'Visitas', value: String(e.total_visitas) },
    { label: 'Gasto total', value: formatEuros(e.gasto_total) },
    { label: 'Última visita', value: e.ultima_visita ? formatFechaCorta(e.ultima_visita) : '—' },
    { label: 'Próxima cita', value: e.proxima_cita ? `${formatFechaCorta(e.proxima_cita)} ${formatHora(e.proxima_cita)}` : '—' },
  ];

  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg bg-stone-50 px-3 py-2">
            <dt className="text-xs text-stone-500">{s.label}</dt>
            <dd className="text-sm font-semibold text-stone-900 tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>
      {(e.servicio_favorito || e.no_asistencias > 0) && (
        <p className="text-sm text-stone-600">
          {e.servicio_favorito && (
            <>
              Servicio habitual: <strong className="text-stone-900">{e.servicio_favorito}</strong>.{' '}
            </>
          )}
          {e.no_asistencias > 0 && <span className="text-red-700">{e.no_asistencias} cita(s) sin asistir.</span>}
        </p>
      )}

      {visitas.length === 0 ? (
        <p className="text-sm text-stone-500">Este cliente aún no tiene citas.</p>
      ) : (
        <ol className="relative space-y-4 border-l border-stone-200 pl-5">
          {visitas.map((v) => (
            <li key={v.cita_id} className="relative">
              <span
                aria-hidden="true"
                className="absolute top-1.5 -left-[1.6rem] size-2.5 rounded-full border-2 border-white bg-brand-500"
              />
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-stone-900 tabular-nums">
                  {formatFechaCorta(v.fecha_inicio)} · {formatHora(v.fecha_inicio)}
                </p>
                <EstadoBadge estado={v.estado} />
                <span className="text-xs text-stone-500">con {v.empleado_nombre}</span>
              </div>
              <ul className="mt-1 space-y-0.5 text-sm text-stone-700">
                {v.servicios.map((s) => (
                  <li key={s.servicio_id}>
                    {s.servicio_nombre} <span className="text-stone-500">· {formatEuros(s.precio)}</span>
                    {s.notas_tecnicas && <span className="block text-xs text-brand-800">Fórmula / técnica: {s.notas_tecnicas}</span>}
                  </li>
                ))}
              </ul>
              {v.notas_cita && <p className="mt-1 text-xs text-stone-500 italic">“{v.notas_cita}”</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
