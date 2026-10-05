/**
 * Proveedor Meta WhatsApp Cloud API.
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 *
 * Webhook (JSON) a /api/webhooks/whatsapp/meta:
 *  - GET  -> verificación (hub.mode, hub.verify_token, hub.challenge)
 *  - POST -> entry[].changes[].value.{ messages[], statuses[] }
 */
import { z } from 'zod';
import type { ClavePlantilla, EstadoEntrega } from '../../models/notificacion.model.js';
import { normalizePhone } from '../../utils/phone.js';
import type { EventoEstadoEntrega, MensajeEntrante, WhatsAppProvider } from './whatsapp.provider.js';

export interface MetaConfig {
  readonly accessToken: string;
  readonly phoneNumberId: string;
  readonly apiVersion: string;
  /** Nombre de cada plantilla aprobada en WhatsApp Manager */
  readonly plantillas: Readonly<Partial<Record<ClavePlantilla, string>>>;
  readonly templateLanguage: string;
}

const ESTADOS: Readonly<Record<string, EstadoEntrega>> = {
  sent: 'enviado',
  delivered: 'entregado',
  read: 'leido',
  failed: 'fallido',
};

/*
 * Esquema tolerante del webhook: solo validamos lo que usamos y dejamos pasar
 * el resto (Meta añade campos con frecuencia). Lo que no encaja se ignora.
 */
const metaWebhookSchema = z.object({
  entry: z
    .array(
      z.object({
        changes: z.array(
          z.object({
            value: z.object({
              messages: z
                .array(
                  z.object({
                    from: z.string(),
                    id: z.string(),
                    type: z.string(),
                    text: z.object({ body: z.string() }).optional(),
                    button: z.object({ text: z.string() }).optional(),
                    interactive: z.object({ button_reply: z.object({ title: z.string() }).optional() }).optional(),
                  }),
                )
                .optional(),
              statuses: z
                .array(
                  z.object({
                    id: z.string(),
                    status: z.string(),
                    timestamp: z.string(),
                    errors: z.array(z.object({ title: z.string().optional(), code: z.number().optional() })).optional(),
                  }),
                )
                .optional(),
            }),
          }),
        ),
      }),
    )
    .default([]),
});

interface MetaSendResponse {
  messages?: { id: string }[];
  error?: { message: string };
}

export function crearMetaProvider(cfg: MetaConfig): WhatsAppProvider {
  const url = `https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`;

  return {
    nombre: 'meta',

    async enviar({ to, body, plantilla }) {
      const destinatario = to.replace(/^\+/, ''); // Meta espera el número sin '+'

      const nombrePlantilla = plantilla ? cfg.plantillas[plantilla.clave] : undefined;
      const payload =
        plantilla && nombrePlantilla
          ? {
              messaging_product: 'whatsapp',
              to: destinatario,
              type: 'template',
              template: {
                name: nombrePlantilla,
                language: { code: cfg.templateLanguage },
                components: [{ type: 'body', parameters: plantilla.parametros.map((text) => ({ type: 'text', text })) }],
              },
            }
          : { messaging_product: 'whatsapp', to: destinatario, type: 'text', text: { body, preview_url: false } };

      const response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      const data = (await response.json().catch(() => ({}))) as MetaSendResponse;
      const id = data.messages?.[0]?.id;

      if (!response.ok || !id) {
        throw new Error(`Meta API ${response.status}: ${data.error?.message ?? 'respuesta inesperada'}`);
      }
      return { providerMessageId: id };
    },

    parsearWebhook(rawBody) {
      const parsed = metaWebhookSchema.safeParse(rawBody);
      if (!parsed.success) return { mensajes: [], estados: [] };

      const mensajes: MensajeEntrante[] = [];
      const estados: EventoEstadoEntrega[] = [];

      for (const { value } of parsed.data.entry.flatMap((e) => e.changes)) {
        for (const m of value.messages ?? []) {
          const texto = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title;
          const from = normalizePhone(m.from, { defaultCountryCode: '', assumeInternational: true });
          if (texto && from) mensajes.push({ from, body: texto, providerMessageId: m.id });
        }
        for (const s of value.statuses ?? []) {
          const estado = ESTADOS[s.status];
          if (!estado) continue;
          const error = s.errors?.[0];
          estados.push({
            providerMessageId: s.id,
            estado,
            timestamp: new Date(Number(s.timestamp) * 1000),
            error: error ? `Meta ${error.code ?? ''}: ${error.title ?? ''}`.trim() : null,
          });
        }
      }
      return { mensajes, estados };
    },
  };
}
