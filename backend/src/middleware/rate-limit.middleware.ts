/**
 * Limitación de peticiones (abuso y fuerza bruta).
 * Con REDIS_URL los contadores se comparten entre instancias; sin él, en memoria.
 */
import rateLimit, { type Options } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { env } from '../config/env.js';
import { redis } from '../config/redis.js';

const body = (message: string) => ({ success: false, error: { message, code: 'RATE_LIMITED' } });

function store(prefijo: string): Pick<Options, 'store'> | Record<string, never> {
  if (!redis) return {};
  return {
    store: new RedisStore({
      prefix: `rl:${prefijo}:`,
      sendCommand: (...args: string[]) => redis!.sendCommand<RedisReply>(args),
    }),
  };
}

const comun = { standardHeaders: 'draft-8', legacyHeaders: false, skip: () => env.NODE_ENV === 'test' } as const;

export const apiLimiter = rateLimit({
  ...comun,
  ...store('api'),
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  message: body('Demasiadas peticiones, inténtalo más tarde'),
});

export const loginLimiter = rateLimit({
  ...comun,
  ...store('login'),
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  message: body('Demasiados intentos de acceso. Espera 15 minutos.'),
});

/** Webhooks: los proveedores reintentan, pero un volumen anómalo es sospechoso */
export const webhookLimiter = rateLimit({
  ...comun,
  ...store('webhook'),
  windowMs: 60 * 1000,
  limit: 300,
  message: body('Demasiadas peticiones'),
});
