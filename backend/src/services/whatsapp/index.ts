/**
 * Factoría del proveedor de WhatsApp activo (según WHATSAPP_PROVIDER).
 * Se crea una sola instancia perezosa por proceso.
 */
import { env } from '../../config/env.js';
import { CLAVES_PLANTILLA, type ClavePlantilla } from '../../models/notificacion.model.js';
import { crearConsoleProvider } from './console.provider.js';
import { crearMetaProvider } from './meta.provider.js';
import { crearTwilioProvider } from './twilio.provider.js';
import type { WhatsAppProvider } from './whatsapp.provider.js';

export type * from './whatsapp.provider.js';

let instancia: WhatsAppProvider | null = null;

/** Quita las plantillas no configuradas (variables vacías del .env) */
function limpiar(plantillas: Record<ClavePlantilla, string | undefined>): Partial<Record<ClavePlantilla, string>> {
  return Object.fromEntries(Object.entries(plantillas).filter(([, v]) => Boolean(v)));
}

/** Plantillas configuradas, para avisar al arrancar si falta alguna en producción */
export function plantillasFaltantes(): ClavePlantilla[] {
  const configuradas =
    env.WHATSAPP_PROVIDER === 'twilio'
      ? [
          env.TWILIO_CONTENT_SID_CONFIRMACION,
          env.TWILIO_CONTENT_SID_RECORDATORIO,
          env.TWILIO_CONTENT_SID_CAMBIO,
          env.TWILIO_CONTENT_SID_CANCELACION,
        ]
      : env.WHATSAPP_PROVIDER === 'meta'
        ? [env.META_TEMPLATE_CONFIRMACION, env.META_TEMPLATE_RECORDATORIO, env.META_TEMPLATE_CAMBIO, env.META_TEMPLATE_CANCELACION]
        : null;
  if (!configuradas) return [];
  return CLAVES_PLANTILLA.filter((_, i) => !configuradas[i]);
}

function crear(): WhatsAppProvider {
  switch (env.WHATSAPP_PROVIDER) {
    case 'twilio': {
      // Twilio solo puede llamar a URLs públicas https (no localhost)
      const callback = new URL('/api/webhooks/whatsapp/twilio', env.PUBLIC_BASE_URL);
      return crearTwilioProvider({
        // Presencia garantizada por la validación de config/env.ts
        accountSid: env.TWILIO_ACCOUNT_SID!,
        authToken: env.TWILIO_AUTH_TOKEN!,
        from: env.TWILIO_WHATSAPP_FROM!,
        statusCallbackUrl: callback.protocol === 'https:' ? callback.toString() : null,
        plantillas: limpiar({
          confirmacion: env.TWILIO_CONTENT_SID_CONFIRMACION,
          recordatorio: env.TWILIO_CONTENT_SID_RECORDATORIO,
          cambio: env.TWILIO_CONTENT_SID_CAMBIO,
          cancelacion: env.TWILIO_CONTENT_SID_CANCELACION,
        }),
      });
    }
    case 'meta':
      return crearMetaProvider({
        accessToken: env.META_ACCESS_TOKEN!,
        phoneNumberId: env.META_PHONE_NUMBER_ID!,
        apiVersion: env.META_API_VERSION,
        plantillas: limpiar({
          confirmacion: env.META_TEMPLATE_CONFIRMACION,
          recordatorio: env.META_TEMPLATE_RECORDATORIO,
          cambio: env.META_TEMPLATE_CAMBIO,
          cancelacion: env.META_TEMPLATE_CANCELACION,
        }),
        templateLanguage: env.META_TEMPLATE_LANGUAGE,
      });
    case 'console':
      return crearConsoleProvider();
  }
}

export function getWhatsAppProvider(): WhatsAppProvider {
  instancia ??= crear();
  return instancia;
}

/**
 * Solo tests: sustituye el proveedor (p. ej. uno que falla, para probar los
 * reintentos del outbox). `null` restaura el configurado.
 */
export function usarProveedorDePruebas(proveedor: WhatsAppProvider | null): void {
  if (env.NODE_ENV !== 'test') throw new Error('usarProveedorDePruebas solo está disponible en tests');
  instancia = proveedor;
}
