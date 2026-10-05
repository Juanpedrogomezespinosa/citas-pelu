/**
 * Punto de entrada: comprueba la BD, arranca HTTP, el worker de
 * notificaciones y las tareas programadas, y cierra todo ordenadamente al
 * recibir SIGINT/SIGTERM (despliegues sin perder peticiones en curso).
 */
import { env, isProduction } from './config/env.js';
import { pingDatabase, pool } from './config/database.js';
import { redis } from './config/redis.js';
import { createApp } from './app.js';
import { iniciarTareasProgramadas } from './services/jobs.js';
import { OutboxWorker } from './services/outbox.service.js';
import { plantillasFaltantes } from './services/whatsapp/index.js';
import { logger } from './utils/logger.js';

try {
  await pingDatabase();
  logger.info(`Conectado a MySQL (${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME})`);
} catch (error) {
  logger.error('No se pudo conectar a MySQL. ¿Está arrancada la BD y aplicadas las migraciones?', {
    error: (error as Error).message,
  });
  process.exit(1);
}

const faltan = plantillasFaltantes();
if (faltan.length > 0) {
  const msg = `Plantillas de WhatsApp sin configurar: ${faltan.join(', ')}. Esos mensajes saldrán como texto libre y el proveedor los rechazará fuera de la ventana de 24 h.`;
  if (isProduction) logger.error(msg);
  else logger.warn(msg);
}

const pararWorker = OutboxWorker.iniciar();
const tareas = iniciarTareasProgramadas();
OutboxWorker.despertar(); // envía lo que quedara en cola de una ejecución anterior

const server = createApp().listen(env.PORT, () => {
  logger.info(`API escuchando en http://localhost:${env.PORT}/api (${env.NODE_ENV}, WhatsApp: ${env.WHATSAPP_PROVIDER})`);
});

let cerrando = false;
function shutdown(signal: string): void {
  if (cerrando) return;
  cerrando = true;
  logger.info(`${signal} recibido: cerrando...`);

  for (const tarea of tareas) void tarea.stop();
  server.close(async () => {
    await pararWorker(); // deja terminar el lote de WhatsApp en curso
    await pool.end();
    await redis?.quit().catch(() => undefined);
    logger.info('Servidor detenido');
    process.exit(0);
  });
  // Si alguna conexión se queda colgada, forzar salida
  setTimeout(() => process.exit(1), 15_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => logger.error('Promesa rechazada sin manejar', { reason: String(reason) }));
