/**
 * Procesamiento de webhooks de WhatsApp: respuestas de los clientes
 * (confirmar / cancelar) y estados de entrega de nuestros mensajes.
 *
 * Todo el tratamiento de un mensaje entrante es UNA transacción:
 *   registrar el mensaje (deduplicado por su id)  +  aplicar la acción a la cita
 *   +  encolar la respuesta automática.
 * Si algo falla se deshace entero y el proveedor reintenta el webhook; si el
 * webhook llega repetido, la clave única lo detecta y no se repite nada.
 */
import type { PoolConnection } from 'mysql2/promise';
import { withTransaction } from '../config/database.js';
import { CitaModel } from '../models/cita.model.js';
import { ClienteModel } from '../models/cliente.model.js';
import { NotificacionModel, puedeAvanzar, type RespuestaInterpretada } from '../models/notificacion.model.js';
import { AppError } from '../utils/app-error.js';
import { logger } from '../utils/logger.js';
import { bloquearCita, cambiarEstadoEnTransaccion, cancelarEnTransaccion } from './cita.service.js';
import { CTX, encolarRespuesta, OutboxWorker } from './outbox.service.js';
import { getWhatsAppProvider, type EventoEstadoEntrega, type EventosWebhook, type MensajeEntrante } from './whatsapp/index.js';
import { Mensajes, interpretarRespuesta } from './whatsapp/mensajes.js';

export type AccionRespuesta = 'confirmada' | 'cancelada' | 'sin_cita' | 'no_entendida' | 'error' | 'cliente_desconocido' | 'duplicado';

export interface ResultadoMensaje {
  accion: AccionRespuesta;
  citaId: number | null;
}

const isDuplicateKey = (error: unknown): boolean => (error as { code?: string } | null)?.code === 'ER_DUP_ENTRY';

/** Aplica la intención del cliente a la cita. Devuelve la acción y el texto de respuesta. */
async function aplicarIntencion(
  conn: PoolConnection,
  intencion: RespuestaInterpretada,
  citaId: number,
): Promise<{ accion: AccionRespuesta; texto: string }> {
  if (intencion === 'desconocida') return { accion: 'no_entendida', texto: Mensajes.respuestaNoEntendida() };

  const ahora = new Date();
  try {
    // Las validaciones (transición permitida...) lanzan ANTES de escribir nada,
    // así que capturar el error aquí no deja la transacción a medias.
    const cita = await bloquearCita(citaId, conn);
    const detalle = await CitaModel.findDetalle(citaId, conn);
    if (!detalle) throw AppError.notFound('Cita');
    if (intencion === 'confirmar') {
      await cambiarEstadoEnTransaccion(conn, cita, 'confirmada', 'whatsapp', ahora);
      return { accion: 'confirmada', texto: Mensajes.respuestaConfirmada(detalle, CTX) };
    }
    await cancelarEnTransaccion(conn, cita, 'Cancelada por el cliente vía WhatsApp', 'whatsapp', ahora);
    return { accion: 'cancelada', texto: Mensajes.respuestaCancelada(detalle, CTX) };
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    logger.warn('No se pudo aplicar la respuesta de WhatsApp', { citaId, error: error.message });
    return { accion: 'error', texto: Mensajes.respuestaError() };
  }
}

async function procesarMensajeEntrante(m: MensajeEntrante): Promise<ResultadoMensaje> {
  const resultado = await withTransaction(async (conn): Promise<ResultadoMensaje> => {
    const cliente = await ClienteModel.findByTelefono(m.from, conn);
    const cita = cliente ? await CitaModel.findCitaDeRespuesta(cliente.id, new Date(), conn) : null;
    const intencion = interpretarRespuesta(m.body);

    // 1) Registrar el mensaje; un webhook repetido choca con la clave única
    try {
      await NotificacionModel.insert(
        {
          tipo: 'mensaje_entrante',
          direccion: 'entrante',
          estado: 'recibido',
          proveedor: getWhatsAppProvider().nombre,
          telefono: m.from,
          mensaje: m.body.slice(0, 2000),
          cliente_id: cliente?.id ?? null,
          cita_id: cita?.id ?? null,
          proveedor_message_id: m.providerMessageId,
          clave_idempotencia: `in:${getWhatsAppProvider().nombre}:${m.providerMessageId}`,
          respuesta_interpretada: intencion,
        },
        conn,
      );
    } catch (error) {
      if (isDuplicateKey(error)) return { accion: 'duplicado', citaId: cita?.id ?? null };
      throw error;
    }

    // 2) Números desconocidos: no se responde (evita conversaciones con spam)
    if (!cliente?.telefono) {
      logger.info('Mensaje de WhatsApp de un número no registrado', { telefono: `${m.from.slice(0, -4)}****` });
      return { accion: 'cliente_desconocido', citaId: null };
    }

    // 3) Aplicar la intención y encolar la respuesta, todo en esta transacción
    const { accion, texto } = cita
      ? await aplicarIntencion(conn, intencion, cita.id)
      : { accion: 'sin_cita' as const, texto: Mensajes.respuestaSinCita(CTX) };
    await encolarRespuesta(conn, { clienteId: cliente.id, citaId: cita?.id ?? null, telefono: cliente.telefono, texto });
    return { accion, citaId: cita?.id ?? null };
  });

  OutboxWorker.despertar();
  return resultado;
}

async function procesarEstadoEntrega(e: EventoEstadoEntrega): Promise<void> {
  const notificacion = await NotificacionModel.findByProveedorId(e.providerMessageId);
  if (!notificacion || !puedeAvanzar(notificacion.estado, e.estado)) return;
  await NotificacionModel.updateEstadoEntrega(notificacion.id, e.estado, e.timestamp, e.error);
}

export const WhatsAppEntranteService = {
  async procesarWebhook(eventos: EventosWebhook): Promise<ResultadoMensaje[]> {
    const resultados: ResultadoMensaje[] = [];
    for (const m of eventos.mensajes) resultados.push(await procesarMensajeEntrante(m));
    for (const e of eventos.estados) await procesarEstadoEntrega(e);
    return resultados;
  },

  procesarMensajeEntrante,
} as const;
