import { useAsync } from '../../hooks/useAsync';
import { api } from '../../lib/api';
import { formatDuracion, formatEuros, formatFecha, formatFechaCorta, formatHora } from '../../lib/format';
import type { Cita } from '../../lib/types';
import { EstadoBadge } from '../ui/EstadoBadge';
import { Modal } from '../ui/Modal';
import { Spinner } from '../ui/Spinner';

const TIPO_LABEL: Record<string, string> = {
  confirmacion_cita: 'Confirmación enviada',
  recordatorio: 'Recordatorio enviado',
  cambio_cita: 'Aviso de cambio',
  cancelacion: 'Aviso de cancelación',
  respuesta_automatica: 'Respuesta automática',
  mensaje_entrante: 'Respuesta del cliente',
};

/** Detalle de una cita con la traza completa de mensajes de WhatsApp */
export function CitaDetalleModal({ cita, onClose }: { cita: Cita | null; onClose: () => void }) {
  return (
    <Modal open={cita !== null} onClose={onClose} size="lg">
      {cita && (
        <>
          <Modal.Header>Cita de {cita.cliente_nombre}</Modal.Header>
          <Modal.Body className="space-y-5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <EstadoBadge estado={cita.estado} />
              <span className="text-stone-700 first-letter:uppercase">
                {formatFecha(cita.fecha_inicio)}, {formatHora(cita.fecha_inicio)}–{formatHora(cita.fecha_fin)}
              </span>
              <span className="text-stone-500">con {cita.empleado_nombre}</span>
            </div>

            <table className="w-full text-left">
              <caption className="sr-only">Servicios de la cita</caption>
              <thead className="text-xs text-stone-500">
                <tr>
                  <th className="py-1 font-medium">Servicio</th>
                  <th className="py-1 font-medium">Duración</th>
                  <th className="py-1 text-right font-medium">Precio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {cita.servicios.map((s) => (
                  <tr key={s.servicio_id}>
                    <td className="py-1.5 text-stone-900">
                      {s.nombre}
                      {s.notas_tecnicas && <span className="block text-xs text-brand-800">Ficha técnica: {s.notas_tecnicas}</span>}
                    </td>
                    <td className="py-1.5 text-stone-600">{formatDuracion(s.duracion_minutos)}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatEuros(s.precio)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="pt-2" colSpan={2}>
                    Total
                  </td>
                  <td className="pt-2 text-right tabular-nums">{formatEuros(cita.precio_total)}</td>
                </tr>
              </tfoot>
            </table>

            {cita.notas && <p className="rounded-lg bg-stone-50 px-3 py-2 text-stone-700">{cita.notas}</p>}
            {cita.motivo_cancelacion && <p className="text-red-700">Motivo de cancelación: {cita.motivo_cancelacion}</p>}

            <Mensajes citaId={cita.id} />
          </Modal.Body>
        </>
      )}
    </Modal>
  );
}

function Mensajes({ citaId }: { citaId: number }) {
  const { data, loading, error } = useAsync(() => api.notificaciones.list({ cita_id: citaId, limit: 50 }), [citaId]);

  return (
    <section aria-labelledby="titulo-mensajes">
      <h3 id="titulo-mensajes" className="mb-2 font-medium text-stone-900">
        Mensajes de WhatsApp
      </h3>
      {loading ? (
        <Spinner className="text-brand-700" />
      ) : error ? (
        <p className="text-red-700">{error}</p>
      ) : !data?.items.length ? (
        <p className="text-stone-500">Sin mensajes para esta cita.</p>
      ) : (
        <ol className="space-y-2">
          {[...data.items].reverse().map((n) => (
            <li
              key={n.id}
              className={n.direccion === 'entrante' ? 'mr-8 rounded-lg bg-brand-50 px-3 py-2' : 'ml-8 rounded-lg bg-emerald-50 px-3 py-2'}
            >
              <p className="flex justify-between gap-2 text-xs text-stone-500">
                <span className="font-medium text-stone-700">{TIPO_LABEL[n.tipo] ?? n.tipo}</span>
                <span className="tabular-nums">
                  {formatFechaCorta(n.created_at)} {formatHora(n.created_at)} · {n.estado}
                </span>
              </p>
              <p className="mt-1 whitespace-pre-line text-stone-800">{n.mensaje}</p>
              {n.error && <p className="mt-1 text-xs text-red-700">{n.error}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
