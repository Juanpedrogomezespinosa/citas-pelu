/**
 * Verificación de autenticidad de los webhooks de WhatsApp.
 *
 * Los webhooks son públicos (sin JWT): sin esta comprobación, cualquiera podría
 * enviar un POST falso que "confirme" o "cancele" citas. Cada proveedor firma
 * sus peticiones con un secreto compartido y aquí lo verificamos.
 */
import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import twilio from 'twilio';
import { env } from '../config/env.js';
import { AppError } from '../utils/app-error.js';
import { logger } from '../utils/logger.js';

/** Twilio: X-Twilio-Signature = HMAC-SHA1(URL pública + parámetros, AUTH_TOKEN) */
export function verifyTwilioSignature(req: Request, _res: Response, next: NextFunction): void {
  const signature = req.get('x-twilio-signature');
  // Debe ser EXACTAMENTE la URL configurada en Twilio (la pública, no localhost)
  const url = new URL(req.originalUrl, env.PUBLIC_BASE_URL).toString();
  const params = (req.body ?? {}) as Record<string, string>;

  const valid = Boolean(signature && env.TWILIO_AUTH_TOKEN) && twilio.validateRequest(env.TWILIO_AUTH_TOKEN!, signature!, url, params);

  if (!valid) {
    logger.warn('Webhook de Twilio con firma inválida', { url });
    next(AppError.forbidden('Firma de webhook inválida'));
    return;
  }
  next();
}

/** Meta: X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(cuerpo crudo, APP_SECRET) */
export function verifyMetaSignature(req: Request, _res: Response, next: NextFunction): void {
  const received = (req.get('x-hub-signature-256') ?? '').replace(/^sha256=/, '');

  if (!received || !req.rawBody || !env.META_APP_SECRET) {
    next(AppError.forbidden('Firma de webhook ausente'));
    return;
  }

  const expected = crypto.createHmac('sha256', env.META_APP_SECRET).update(req.rawBody).digest('hex');
  const a = Buffer.from(received, 'hex');
  const b = Buffer.from(expected, 'hex');

  // timingSafeEqual: comparación en tiempo constante (evita ataques de temporización)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    logger.warn('Webhook de Meta con firma inválida');
    next(AppError.forbidden('Firma de webhook inválida'));
    return;
  }
  next();
}
