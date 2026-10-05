import { useCallback, useState } from 'react';
import { api } from '../lib/api';
import type { Cita } from '../lib/types';
import { useAction } from './useAction';

export type AccionCita = 'confirmar' | 'completar' | 'no_asistio' | 'cancelar' | 'recordatorio';

/** Datos extra que recoge el diálogo según la acción */
export interface DatosAccion {
  motivo?: string;
  notasTecnicas?: { servicio_id: number; notas: string }[];
}

export interface ResultadoAccion {
  mensaje: string;
  /** Cita completada pendiente de cobro: la UI ofrece "Cobrar ahora" */
  citaParaCobrar: number | null;
}

/**
 * Acciones sobre una cita desde la agenda. Gestiona qué acción está pendiente
 * de confirmación en el modal y llama a `onDone` para refrescar los datos.
 */
export function useCitaAcciones(onDone: () => void) {
  const [pendiente, setPendiente] = useState<{ accion: AccionCita; cita: Cita } | null>(null);
  const [resultado, setResultado] = useState<ResultadoAccion | null>(null);

  const ejecutar = useCallback(async (accion: AccionCita, cita: Cita, datos: DatosAccion): Promise<ResultadoAccion> => {
    const r = (mensaje: string, citaParaCobrar: number | null = null) => ({ mensaje, citaParaCobrar });
    switch (accion) {
      case 'confirmar':
        await api.citas.cambiarEstado(cita.id, 'confirmada');
        return r('Cita confirmada');
      case 'completar':
        await api.citas.completar(cita.id, datos.notasTecnicas ?? []);
        return r('Cita completada y ficha técnica guardada', cita.id);
      case 'no_asistio':
        await api.citas.cambiarEstado(cita.id, 'no_asistio');
        return r('Registrada la no asistencia');
      case 'cancelar':
        await api.citas.cancelar(cita.id, datos.motivo ?? '');
        return r(cita.cliente_acepta_whatsapp ? 'Cita cancelada. Se ha avisado al cliente por WhatsApp.' : 'Cita cancelada.');
      case 'recordatorio': {
        const n = await api.citas.recordatorio(cita.id);
        return r(
          n.estado === 'enviado'
            ? 'Recordatorio enviado por WhatsApp'
            : `El proveedor no respondió; se reintentará automáticamente (${n.error ?? 'sin detalle'})`,
        );
      }
    }
  }, []);

  const action = useAction(ejecutar);

  const confirmarPendiente = useCallback(
    async (datos: DatosAccion = {}) => {
      if (!pendiente) return;
      const res = await action.run(pendiente.accion, pendiente.cita, datos);
      if (res) {
        setPendiente(null);
        setResultado(res);
        onDone();
      }
    },
    [action, pendiente, onDone],
  );

  return {
    pendiente,
    solicitar: (accion: AccionCita, cita: Cita) => {
      action.reset();
      setPendiente({ accion, cita });
    },
    cancelarSolicitud: () => setPendiente(null),
    confirmarPendiente,
    pending: action.pending,
    error: action.error,
    resultado,
    limpiarResultado: () => setResultado(null),
  };
}
