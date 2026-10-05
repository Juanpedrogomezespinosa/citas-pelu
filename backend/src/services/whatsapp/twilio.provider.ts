/**
 * Proveedor Twilio (WhatsApp Business vía Twilio).
 * Docs: https://www.twilio.com/docs/whatsapp
 *
 * Webhooks (application/x-www-form-urlencoded) a POST /api/webhooks/whatsapp/twilio:
 *  - Mensaje entrante: Body, From ('whatsapp:+34...'), MessageSid, [ButtonText]
 *  - Estado de entrega (statusCallback): MessageSid, MessageStatus, [ErrorCode]
 */
import twilio from 'twilio';
import type { ClavePlantilla, EstadoEntrega } from '../../models/notificacion.model.js';
import { normalizePhone } from '../../utils/phone.js';
import type { EventoEstadoEntrega, MensajeEntrante, WhatsAppProvider } from './whatsapp.provider.js';

export interface TwilioConfig {
  readonly accountSid: string;
  readonly authToken: string;
  readonly from: string;
  /** URL pública del webhook para recibir estados de entrega (solo https) */
  readonly statusCallbackUrl: string | null;
  /** Content SID de cada plantilla aprobada (Content Template Builder) */
  readonly plantillas: Readonly<Partial<Record<ClavePlantilla, string>>>;
}

const ESTADOS: Readonly<Record<string, EstadoEntrega>> = {
  accepted: 'enviado',
  queued: 'enviado',
  sending: 'enviado',
  sent: 'enviado',
  delivered: 'entregado',
  read: 'leido',
  failed: 'fallido',
  undelivered: 'fallido',
};

export function crearTwilioProvider(cfg: TwilioConfig): WhatsAppProvider {
  const client = twilio(cfg.accountSid, cfg.authToken);
  const from = cfg.from.startsWith('whatsapp:') ? cfg.from : `whatsapp:${cfg.from}`;

  return {
    nombre: 'twilio',

    async enviar({ to, body, plantilla }) {
      const base = {
        from,
        to: `whatsapp:${to}`,
        ...(cfg.statusCallbackUrl ? { statusCallback: cfg.statusCallbackUrl } : {}),
      };

      // Con plantilla aprobada (Content API) si está configurada; si no, texto libre
      const contentSid = plantilla ? cfg.plantillas[plantilla.clave] : undefined;
      const message =
        plantilla && contentSid
          ? await client.messages.create({
              ...base,
              contentSid,
              contentVariables: JSON.stringify(Object.fromEntries(plantilla.parametros.map((p, i) => [String(i + 1), p]))),
            })
          : await client.messages.create({ ...base, body });

      return { providerMessageId: message.sid };
    },

    parsearWebhook(rawBody) {
      const body = (rawBody ?? {}) as Record<string, string | undefined>;
      const mensajes: MensajeEntrante[] = [];
      const estados: EventoEstadoEntrega[] = [];

      if (body['Body'] !== undefined && body['From'] && body['MessageSid']) {
        const fromPhone = normalizePhone(body['From'], { defaultCountryCode: '', assumeInternational: true });
        if (fromPhone) {
          mensajes.push({ from: fromPhone, body: body['ButtonText'] ?? body['Body'], providerMessageId: body['MessageSid'] });
        }
      } else if (body['MessageStatus'] && body['MessageSid']) {
        const estado = ESTADOS[body['MessageStatus']];
        if (estado) {
          estados.push({
            providerMessageId: body['MessageSid'],
            estado,
            timestamp: new Date(),
            error: body['ErrorCode'] ? `Twilio ${body['ErrorCode']}: ${body['ErrorMessage'] ?? ''}`.trim() : null,
          });
        }
      }
      return { mensajes, estados };
    },
  };
}
