/**
 * Outbox de notificaciones de WhatsApp.
 *
 * Problema: enviar el WhatsApp después del COMMIT pierde el mensaje si el
 * proceso cae entre medias; enviarlo dentro de la transacción haría depender
 * la reserva de un servicio externo lento y enviaría avisos de operaciones que
 * luego hacen ROLLBACK.
 *
 * Solución (patrón outbox): la operación de negocio INSERTA el mensaje en
 * `notificaciones` (estado 'pendiente') dentro de SU MISMA transacción. Así,
 * cita y mensaje se guardan juntos o no se guarda ninguno (atomicidad). Un
 * worker lee la cola y envía con reintentos y backoff exponencial.
 *
 *  - Varias instancias: SELECT ... FOR UPDATE SKIP LOCKED + "alquiler".
 *  - Duplicados: clave_idempotencia UNIQUE.
 *  - Caída a mitad de envío: al vencer el alquiler otro worker lo reintenta.
 *    (Garantía "al menos una vez": en ese caso extremo podría duplicarse un
 *    mensaje, preferible a perderlo.)
 */
import { env } from '../config/env.js';
import { withTransaction, type Db } from '../config/database.js';
import { metricas } from '../config/metrics.js';
import { CitaModel, type CitaDetalle } from '../models/cita.model.js';
import { NotificacionModel, type Notificacion, type TipoNotificacion } from '../models/notificacion.model.js';
import { addMinutes } from '../utils/dates.js';
import { logger } from '../utils/logger.js';
import { getWhatsAppProvider } from './whatsapp/index.js';
import { Mensajes, type ContextoMensaje, type MensajeConPlantilla } from './whatsapp/mensajes.js';

export const CTX: ContextoMensaje = Object.freeze({ negocio: env.BUSINESS_NAME, timeZone: env.APP_TIMEZONE });

const LOTE = 20;
const ALQUILER_MIN = 2;
const MAX_INTENTOS = 5;
/** Espera antes de cada reintento (minutos): 1, 5, 15, 60 */
const BACKOFF_MIN = [1, 5, 15, 60] as const;

export type ResultadoEncolar =
  | { readonly estado: 'encolada'; readonly id: number }
  | { readonly estado: 'omitida'; readonly motivo: 'sin_consentimiento' | 'duplicada' | 'cita_no_encontrada' | 'anonimizado' };

const isDuplicateKey = (error: unknown): boolean => (error as { code?: string } | null)?.code === 'ER_DUP_ENTRY';

type AvisoCita = Extract<TipoNotificacion, 'confirmacion_cita' | 'recordatorio' | 'cambio_cita' | 'cancelacion'>;

const CONSTRUCTORES: Readonly<Record<AvisoCita, (cita: CitaDetalle, ctx: ContextoMensaje) => MensajeConPlantilla>> = {
  confirmacion_cita: (c, ctx) => Mensajes.confirmacionCita(c, ctx),
  recordatorio: (c, ctx) => Mensajes.recordatorio(c, ctx),
  cambio_cita: (c, ctx) => Mensajes.cambioCita(c, ctx),
  cancelacion: (c, ctx) => Mensajes.cancelacion(c, ctx),
};

/**
 * Encola un aviso de cita. Pensado para llamarse DENTRO de la transacción de
 * la operación que lo origina (pasando su conexión `db`).
 */
export async function encolarAvisoCita(
  db: Db,
  citaId: number,
  tipo: AvisoCita,
  claveIdempotencia: string | null,
): Promise<ResultadoEncolar> {
  const cita = await CitaModel.findDetalle(citaId, db);
  if (!cita) return { estado: 'omitida', motivo: 'cita_no_encontrada' };
  if (!cita.cliente_telefono) return { estado: 'omitida', motivo: 'anonimizado' };
  // Consentimiento (RGPD): sin permiso explícito no se envía nada
  if (!cita.cliente_acepta_whatsapp) return { estado: 'omitida', motivo: 'sin_consentimiento' };

  const { texto, plantilla } = CONSTRUCTORES[tipo](cita, CTX);
  try {
    const id = await NotificacionModel.insert(
      {
        tipo,
        direccion: 'saliente',
        estado: 'pendiente',
        proveedor: getWhatsAppProvider().nombre,
        telefono: cita.cliente_telefono,
        mensaje: texto,
        plantilla,
        cita_id: cita.id,
        cliente_id: cita.cliente_id,
        clave_idempotencia: claveIdempotencia,
        proximo_intento_en: new Date(),
      },
      db,
    );
    return { estado: 'encolada', id };
  } catch (error) {
    if (isDuplicateKey(error)) return { estado: 'omitida', motivo: 'duplicada' };
    throw error;
  }
}

/** Encola una respuesta automática a un mensaje del cliente (sin plantilla: ventana de 24 h abierta) */
export async function encolarRespuesta(
  db: Db,
  p: { clienteId: number; citaId: number | null; telefono: string; texto: string },
): Promise<number> {
  return NotificacionModel.insert(
    {
      tipo: 'respuesta_automatica',
      direccion: 'saliente',
      estado: 'pendiente',
      proveedor: getWhatsAppProvider().nombre,
      telefono: p.telefono,
      mensaje: p.texto,
      cita_id: p.citaId,
      cliente_id: p.clienteId,
      proximo_intento_en: new Date(),
    },
    db,
  );
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

async function entregar(n: Notificacion): Promise<void> {
  try {
    const { providerMessageId } = await getWhatsAppProvider().enviar({
      to: n.telefono,
      body: n.mensaje,
      plantilla: n.plantilla_clave && n.plantilla_parametros ? { clave: n.plantilla_clave, parametros: n.plantilla_parametros } : undefined,
    });
    await NotificacionModel.markEnviada(n.id, providerMessageId, new Date());
    metricas.whatsappEnvios.inc({ resultado: 'enviado', tipo: n.tipo });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    const intentos = n.intentos + 1;
    if (intentos >= MAX_INTENTOS) {
      logger.error('WhatsApp fallido definitivamente', { notificacionId: n.id, intentos, error: mensaje });
      await NotificacionModel.markFallida(n.id, mensaje);
      metricas.whatsappEnvios.inc({ resultado: 'fallido', tipo: n.tipo });
    } else {
      const espera = BACKOFF_MIN[Math.min(intentos - 1, BACKOFF_MIN.length - 1)]!;
      logger.warn('Fallo al enviar WhatsApp, se reintentará', { notificacionId: n.id, intentos, enMinutos: espera, error: mensaje });
      await NotificacionModel.markReintento(n.id, mensaje, addMinutes(new Date(), espera));
      metricas.whatsappEnvios.inc({ resultado: 'reintento', tipo: n.tipo });
    }
  }
}

/** Reclama y envía un lote. Devuelve cuántos mensajes procesó. */
async function procesarLote(): Promise<number> {
  const ahora = new Date();
  const lote = await withTransaction(async (conn) => {
    const filas = await NotificacionModel.reclamarPendientes(ahora, LOTE, conn);
    await NotificacionModel.alquilar(
      filas.map((f) => f.id),
      addMinutes(ahora, ALQUILER_MIN),
      conn,
    );
    return filas;
  });
  // En serie: respeta los límites de envío del proveedor
  for (const n of lote) await entregar(n);
  return lote.length;
}

let enCurso: Promise<number> | null = null;
let repetir = false;
let temporizador: NodeJS.Timeout | null = null;

/** Procesa la cola hasta vaciarla. Llamadas concurrentes comparten la ejecución en curso. */
function procesarCola(): Promise<number> {
  if (enCurso) {
    repetir = true;
    return enCurso;
  }
  enCurso = (async () => {
    let total = 0;
    try {
      do {
        repetir = false;
        let procesados: number;
        do {
          procesados = await procesarLote();
          total += procesados;
        } while (procesados === LOTE);
      } while (repetir);
    } finally {
      enCurso = null;
    }
    return total;
  })();
  return enCurso;
}

export const OutboxWorker = {
  /** Arranca el sondeo periódico. Devuelve la función para pararlo. */
  iniciar(): () => Promise<void> {
    temporizador = setInterval(() => {
      procesarCola().catch((error: Error) => logger.error('Error en el worker de notificaciones', { error: error.message }));
    }, env.OUTBOX_INTERVAL_SECONDS * 1000);
    temporizador.unref();
    logger.info(`Worker de notificaciones activo (cada ${env.OUTBOX_INTERVAL_SECONDS} s)`);
    return async () => {
      if (temporizador) clearInterval(temporizador);
      await enCurso?.catch(() => undefined);
    };
  },

  /** Tras un COMMIT que encoló mensajes: enviarlos ya, sin esperar al siguiente ciclo (no bloquea) */
  despertar(): void {
    setImmediate(() => {
      procesarCola().catch((error: Error) => logger.error('Error en el worker de notificaciones', { error: error.message }));
    });
  },

  /** Procesa la cola y espera a que termine (envío manual desde el panel, tests) */
  procesarAhora: procesarCola,
} as const;
