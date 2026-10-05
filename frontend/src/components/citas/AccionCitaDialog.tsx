import { useEffect, useState } from 'react';
import type { AccionCita, DatosAccion } from '../../hooks/useCitaAcciones';
import { formatFecha, formatHora } from '../../lib/format';
import type { Cita } from '../../lib/types';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Field, Textarea } from '../ui/Field';

interface AccionCitaDialogProps {
  solicitud: { accion: AccionCita; cita: Cita } | null;
  pending: boolean;
  error: string | null;
  onConfirm: (datos: DatosAccion) => void;
  onCancel: () => void;
}

const TEXTOS: Record<AccionCita, { titulo: string; boton: string; tone: 'primary' | 'danger' }> = {
  confirmar: { titulo: 'Confirmar asistencia', boton: 'Confirmar cita', tone: 'primary' },
  completar: { titulo: 'Completar cita', boton: 'Completar y guardar ficha', tone: 'primary' },
  no_asistio: { titulo: 'Registrar no asistencia', boton: 'No asistió', tone: 'danger' },
  cancelar: { titulo: 'Cancelar cita', boton: 'Cancelar cita', tone: 'danger' },
  recordatorio: { titulo: 'Enviar recordatorio', boton: 'Enviar WhatsApp', tone: 'primary' },
};

export function AccionCitaDialog({ solicitud, pending, error, onConfirm, onCancel }: AccionCitaDialogProps) {
  const [motivo, setMotivo] = useState('');
  const [notas, setNotas] = useState<Record<number, string>>({});

  useEffect(() => {
    setMotivo('');
    setNotas(Object.fromEntries((solicitud?.cita.servicios ?? []).map((s) => [s.servicio_id, s.notas_tecnicas ?? ''])));
  }, [solicitud]);

  if (!solicitud) return null;

  const { accion, cita } = solicitud;
  const textos = TEXTOS[accion];

  const datos = (): DatosAccion => {
    if (accion === 'cancelar') return { motivo };
    if (accion === 'completar')
      return { notasTecnicas: Object.entries(notas).map(([id, texto]) => ({ servicio_id: Number(id), notas: texto })) };
    return {};
  };

  return (
    <ConfirmDialog
      open
      title={textos.titulo}
      confirmLabel={textos.boton}
      tone={textos.tone}
      pending={pending}
      error={error}
      onConfirm={() => onConfirm(datos())}
      onCancel={onCancel}
    >
      <p>
        <strong className="text-stone-900">{cita.cliente_nombre}</strong> ·{' '}
        <span className="inline-block first-letter:uppercase">{formatFecha(cita.fecha_inicio)}</span> a las {formatHora(cita.fecha_inicio)}
      </p>
      {accion !== 'completar' && <p className="text-stone-600">{cita.servicios.map((s) => s.nombre).join(', ')}</p>}

      {accion === 'completar' && (
        <div className="space-y-3">
          <p className="text-stone-600">
            Anota la ficha técnica de cada servicio: aparecerá en el historial del cliente para la próxima visita.
          </p>
          {cita.servicios.map((s) => (
            <Field key={s.servicio_id} label={s.nombre} hint="Fórmula, técnica, productos, tiempos de exposición…">
              {(a11y) => (
                <Textarea
                  {...a11y}
                  rows={2}
                  maxLength={500}
                  value={notas[s.servicio_id] ?? ''}
                  onChange={(e) => setNotas((n) => ({ ...n, [s.servicio_id]: e.target.value }))}
                />
              )}
            </Field>
          ))}
        </div>
      )}

      {accion === 'cancelar' && (
        <>
          <Field label="Motivo (opcional)" hint="Queda registrado en el historial de la cita">
            {(a11y) => <Textarea {...a11y} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} />}
          </Field>
          {cita.cliente_acepta_whatsapp && <p className="text-stone-600">Se avisará al cliente por WhatsApp.</p>}
        </>
      )}
      {accion === 'recordatorio' && <p className="text-stone-600">Se enviará un WhatsApp a {cita.cliente_telefono}.</p>}
    </ConfirmDialog>
  );
}
