/**
 * Proveedor de desarrollo: no envía nada, solo registra el mensaje en consola.
 * Permite trabajar sin credenciales. Para simular respuestas del cliente usa
 * POST /api/webhooks/whatsapp/simular (solo fuera de producción).
 */
import { randomUUID } from 'node:crypto';
import { logger } from '../../utils/logger.js';
import type { WhatsAppProvider } from './whatsapp.provider.js';

export function crearConsoleProvider(): WhatsAppProvider {
  return {
    nombre: 'console',

    enviar({ to, body, plantilla }) {
      const providerMessageId = `console-${randomUUID()}`;
      logger.info(`📱 [WhatsApp simulado] -> ${to}${plantilla ? ` (plantilla: ${plantilla.clave})` : ''}\n${body}`, {
        providerMessageId,
      });
      return Promise.resolve({ providerMessageId });
    },

    parsearWebhook: () => ({ mensajes: [], estados: [] }),
  };
}
