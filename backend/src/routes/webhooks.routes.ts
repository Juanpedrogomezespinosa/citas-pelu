/**
 * Webhooks de WhatsApp. Solo se monta la ruta del proveedor activo, siempre
 * protegida por su verificación de firma. El simulador requiere activarlo
 * explícitamente (WHATSAPP_SIMULATOR_ENABLED), nunca en producción, y exige sesión.
 */
import { Router } from 'express';
import { env, isProduction } from '../config/env.js';
import { WebhooksController } from '../controllers/webhooks.controller.js';
import { simularMensajeSchema } from '../dtos/notificacion.dto.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { webhookLimiter } from '../middleware/rate-limit.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { verifyMetaSignature, verifyTwilioSignature } from '../middleware/whatsapp-signature.middleware.js';

export const webhooksRoutes = Router().use(webhookLimiter);

if (env.WHATSAPP_PROVIDER === 'twilio') {
  webhooksRoutes.post('/whatsapp/twilio', verifyTwilioSignature, WebhooksController.twilio);
}

if (env.WHATSAPP_PROVIDER === 'meta') {
  webhooksRoutes
    .get('/whatsapp/meta', WebhooksController.metaVerificar)
    .post('/whatsapp/meta', verifyMetaSignature, WebhooksController.meta);
}

if (env.WHATSAPP_SIMULATOR_ENABLED && !isProduction) {
  webhooksRoutes.post('/whatsapp/simular', authenticate, validate({ body: simularMensajeSchema }), WebhooksController.simular);
}
