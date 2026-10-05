/**
 * Tareas programadas (node-cron).
 *
 *  - Recordatorios: encola los WhatsApp de las citas próximas.
 *  - RGPD (opcional): anonimiza clientes sin actividad durante el periodo de
 *    retención configurado. Desactivada por defecto porque es irreversible.
 *
 * `noOverlap` impide solapes de una misma tarea en este proceso; entre
 * instancias, las claves de idempotencia y los bloqueos de fila evitan
 * duplicados.
 */
import cron, { type ScheduledTask } from 'node-cron';
import { env } from '../config/env.js';
import { CitaModel } from '../models/cita.model.js';
import { AppError } from '../utils/app-error.js';
import { logger } from '../utils/logger.js';
import { ClienteService } from './cliente.service.js';
import { NotificacionService } from './notificacion.service.js';

function programar(nombre: string, expresion: string, tarea: () => Promise<void>): ScheduledTask {
  if (!cron.validate(expresion)) throw new Error(`Expresión cron no válida para "${nombre}": "${expresion}"`);
  return cron.schedule(
    expresion,
    async () => {
      try {
        await tarea();
      } catch (error) {
        logger.error(`Error en la tarea programada "${nombre}"`, { error: (error as Error).message });
      }
    },
    { name: nombre, timezone: env.APP_TIMEZONE, noOverlap: true },
  );
}

/** Anonimiza clientes sin citas en los últimos RGPD_RETENCION_MESES meses */
export async function anonimizarClientesInactivos(ahora = new Date()): Promise<number> {
  const limite = new Date(ahora);
  limite.setMonth(limite.getMonth() - env.RGPD_RETENCION_MESES);

  let anonimizados = 0;
  for (const { id } of await CitaModel.clientesInactivosDesde(limite)) {
    try {
      await ClienteService.anonimizar(id);
      anonimizados++;
    } catch (error) {
      // p. ej. tiene una cita futura: se deja para la siguiente ejecución
      if (!(error instanceof AppError)) throw error;
    }
  }
  return anonimizados;
}

export function iniciarTareasProgramadas(): ScheduledTask[] {
  const tareas: ScheduledTask[] = [];

  if (env.REMINDER_ENABLED) {
    tareas.push(
      programar('recordatorios-citas', env.REMINDER_CRON, async () => {
        const total = await NotificacionService.procesarRecordatoriosPendientes();
        if (total > 0) logger.info(`Recordatorios encolados: ${total}`);
      }),
    );
    logger.info(`Recordatorios automáticos activos (${env.REMINDER_CRON}, ${env.REMINDER_HOURS_BEFORE} h antes)`);
  } else {
    logger.info('Recordatorios automáticos desactivados (REMINDER_ENABLED=false)');
  }

  if (env.RGPD_ANONIMIZACION_AUTOMATICA) {
    // Día 1 de cada mes a las 03:30
    tareas.push(
      programar('rgpd-anonimizacion', '30 3 1 * *', async () => {
        const total = await anonimizarClientesInactivos();
        logger.info(`RGPD: ${total} cliente(s) anonimizados por inactividad (> ${env.RGPD_RETENCION_MESES} meses)`);
      }),
    );
    logger.info(`Anonimización RGPD automática activa (retención ${env.RGPD_RETENCION_MESES} meses)`);
  }

  return tareas;
}
