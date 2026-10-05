/**
 * Cliente Redis opcional (REDIS_URL). Se usa para que el rate limiting sea
 * compartido entre varias instancias del backend. Sin REDIS_URL todo funciona
 * igual con contadores en memoria (válido para una sola instancia).
 *
 * node-redis encola los comandos mientras conecta, así que los módulos pueden
 * usar el cliente nada más importarlo.
 */
import { createClient } from 'redis';
import { logger } from '../utils/logger.js';
import { env } from './env.js';

function crearCliente() {
  if (!env.REDIS_URL) return null;

  const client = createClient({
    url: env.REDIS_URL,
    socket: { reconnectStrategy: (intentos) => Math.min(intentos * 200, 5_000) },
  });
  client.on('error', (error: Error) => logger.warn('Redis no disponible', { error: error.message }));
  client.connect().catch((error: Error) => logger.error('No se pudo conectar a Redis', { error: error.message }));
  return client;
}

export const redis = crearCliente();

export async function pingRedis(): Promise<'ok' | 'error' | 'no_configurado'> {
  if (!redis) return 'no_configurado';
  try {
    await redis.ping();
    return 'ok';
  } catch {
    return 'error';
  }
}
