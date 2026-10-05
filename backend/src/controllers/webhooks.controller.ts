/**
 * Webhooks de WhatsApp (públicos; su autenticidad la verifica el middleware de
 * firma correspondiente antes de llegar aquí).
 *
 * Si el procesamiento falla (p. ej. BD caída) se responde 5xx a propósito: el
 * proveedor reintentará, y la idempotencia evita efectos duplicados.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env.js';
import type { SimularMensajeDto } from '../dtos/notificacion.dto.js';
import { WhatsAppEntranteService } from '../services/whatsapp-entrante.service.js';
import { getWhatsAppProvider } from '../services/whatsapp/index.js';
import { AppError } from '../utils/app-error.js';
import { action, ok } from '../utils/http.js';
import { normalizePhone } from '../utils/phone.js';

const metaVerifySchema = z.object({
  'hub.mode': z.literal('subscribe'),
  'hub.verify_token': z.string(),
  'hub.challenge': z.string().max(200),
});

export const WebhooksController = {
  /** Twilio: espera TwiML; una respuesta vacía significa "no contestes nada más" */
  twilio: action(async (req, res) => {
    await WhatsAppEntranteService.procesarWebhook(getWhatsAppProvider().parsearWebhook(req.body));
    res.type('text/xml').send('<Response></Response>');
  }),

  /** Meta: verificación inicial del webhook (handshake) */
  metaVerificar: action((req, res) => {
    const parsed = metaVerifySchema.safeParse(req.query);
    if (!parsed.success || parsed.data['hub.verify_token'] !== env.META_VERIFY_TOKEN) {
      throw AppError.forbidden('Verificación de webhook fallida');
    }
    res.type('text/plain').send(parsed.data['hub.challenge']);
  }),

  meta: action(async (req, res) => {
    await WhatsAppEntranteService.procesarWebhook(getWhatsAppProvider().parsearWebhook(req.body));
    res.sendStatus(200);
  }),

  /** Solo desarrollo: simula que un cliente responde por WhatsApp */
  simular: action(async (req, res) => {
    const { telefono, mensaje } = req.validatedBody as SimularMensajeDto;
    const from = normalizePhone(telefono, { defaultCountryCode: env.WHATSAPP_DEFAULT_COUNTRY_CODE });
    if (!from) throw AppError.badRequest('Teléfono no válido', 'VALIDATION_ERROR');

    ok(res, await WhatsAppEntranteService.procesarMensajeEntrante({ from, body: mensaje, providerMessageId: `sim-${randomUUID()}` }));
  }),
} as const;
