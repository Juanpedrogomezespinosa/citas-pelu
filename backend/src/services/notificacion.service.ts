/**
 * Consultas del registro de notificaciones, recordatorios (automáticos y
 * manuales) y reintentos. Los envíos los hace el worker del outbox.
 */
import { env } from '../config/env.js';
import { withTransaction } from '../config/database.js';
import type { ListarNotificacionesQuery } from '../dtos/notificacion.dto.js';
import { CitaModel } from '../models/cita.model.js';
import { NotificacionModel, type Notificacion } from '../models/notificacion.model.js';
import { AppError } from '../utils/app-error.js';
import { addMinutes } from '../utils/dates.js';
import { logger } from '../utils/logger.js';
import { buildMeta, type Paginated } from '../utils/pagination.js';
import { encolarAvisoCita, OutboxWorker, type ResultadoEncolar } from './outbox.service.js';

const MOTIVOS_OMISION = {
  sin_consentimiento: 'El cliente no ha dado su consentimiento para recibir WhatsApp',
  anonimizado: 'El cliente está anonimizado',
  cita_no_encontrada: 'Cita no encontrada',
  duplicada: 'El recordatorio ya estaba en cola',
} as const;

/**
 * Encola el recordatorio y marca la cita en la misma transacción.
 * Automático: clave por cita + fecha, así una cita reprogramada recibe un
 * nuevo recordatorio pero nunca dos para la misma hora. Manual: sin clave.
 */
async function encolarRecordatorio(citaId: number, manual: boolean): Promise<ResultadoEncolar> {
  return withTransaction(async (conn) => {
    const cita = await CitaModel.lockById(citaId, conn);
    if (!cita) return { estado: 'omitida', motivo: 'cita_no_encontrada' } as const;
    if (!manual && (cita.recordatorio_enviado || !['pendiente', 'confirmada'].includes(cita.estado))) {
      return { estado: 'omitida', motivo: 'duplicada' } as const; // otra instancia se adelantó
    }
    const clave = manual ? null : `recordatorio:${cita.id}:${cita.fecha_inicio.getTime()}`;
    const resultado = await encolarAvisoCita(conn, citaId, 'recordatorio', clave);
    await CitaModel.markRecordatorioEnviado(citaId, conn);
    return resultado;
  });
}

export const NotificacionService = {
  /** Botón "Recordar" del panel: encola y envía en el momento */
  async enviarRecordatorioManual(citaId: number): Promise<Notificacion> {
    const resultado = await encolarRecordatorio(citaId, true);
    if (resultado.estado === 'omitida') {
      throw new AppError(
        MOTIVOS_OMISION[resultado.motivo],
        resultado.motivo === 'cita_no_encontrada' ? 404 : 422,
        resultado.motivo.toUpperCase(),
      );
    }
    await OutboxWorker.procesarAhora();
    return this.obtener(resultado.id);
  },

  /** Job programado: encola los recordatorios de las próximas REMINDER_HOURS_BEFORE horas */
  async procesarRecordatoriosPendientes(): Promise<number> {
    const ahora = new Date();
    const hasta = addMinutes(ahora, env.REMINDER_HOURS_BEFORE * 60);
    const citas = await CitaModel.findParaRecordatorio(ahora, hasta, env.REMINDER_HOURS_BEFORE, 200);

    let encolados = 0;
    for (const { id } of citas) {
      try {
        if ((await encolarRecordatorio(id, false)).estado === 'encolada') encolados++;
      } catch (error) {
        logger.error('Error encolando recordatorio', { citaId: id, error: (error as Error).message });
      }
    }
    if (encolados > 0) OutboxWorker.despertar();
    return encolados;
  },

  async listar(query: ListarNotificacionesQuery): Promise<Paginated<Notificacion>> {
    const { items, total } = await NotificacionModel.list({ ...query, citaId: query.cita_id, clienteId: query.cliente_id });
    return { items, meta: buildMeta(query, total) };
  },

  async obtener(id: number): Promise<Notificacion> {
    const notificacion = await NotificacionModel.findById(id);
    if (!notificacion) throw AppError.notFound('Notificación');
    return notificacion;
  },

  /** Reintento manual de un envío fallido: vuelve a la cola y se procesa ya */
  async reintentar(id: number): Promise<Notificacion> {
    if (!(await NotificacionModel.reencolar(id, new Date()))) {
      await this.obtener(id); // 404 si no existe
      throw AppError.conflict('Solo se pueden reintentar envíos fallidos', 'NOT_RETRYABLE');
    }
    await OutboxWorker.procesarAhora();
    return this.obtener(id);
  },
} as const;
