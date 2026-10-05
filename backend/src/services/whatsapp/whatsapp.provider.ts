/**
 * Contrato común de los proveedores de WhatsApp (patrón Strategy).
 *
 * El resto de la aplicación solo conoce esta interfaz, así que cambiar de
 * Twilio a Meta (o añadir otro proveedor) es cambiar WHATSAPP_PROVIDER en el
 * .env, sin tocar servicios ni controladores. Los proveedores no conocen
 * Express: reciben el cuerpo del webhook ya parseado.
 */
import type { ClavePlantilla, EstadoEntrega, Proveedor } from '../../models/notificacion.model.js';

/**
 * Plantilla aprobada. Fuera de la "ventana de 24 h" (si el cliente no ha
 * escrito recientemente) WhatsApp SOLO permite iniciar conversación con
 * plantillas aprobadas por Meta: confirmación, recordatorio, cambio y
 * cancelación las inicia el negocio, así que cada una tiene la suya.
 */
export interface PlantillaWhatsApp {
  readonly clave: ClavePlantilla;
  readonly parametros: readonly string[];
}

export interface MensajeSaliente {
  /** Teléfono E.164 */
  readonly to: string;
  /** Texto libre (y alternativa si no hay plantilla configurada) */
  readonly body: string;
  readonly plantilla?: PlantillaWhatsApp | undefined;
}

export interface MensajeEntrante {
  /** Teléfono E.164 del remitente */
  readonly from: string;
  readonly body: string;
  readonly providerMessageId: string;
}

export interface EventoEstadoEntrega {
  readonly providerMessageId: string;
  readonly estado: EstadoEntrega;
  readonly timestamp: Date;
  readonly error: string | null;
}

export interface EventosWebhook {
  readonly mensajes: readonly MensajeEntrante[];
  readonly estados: readonly EventoEstadoEntrega[];
}

export interface WhatsAppProvider {
  readonly nombre: Proveedor;
  enviar(mensaje: MensajeSaliente): Promise<{ providerMessageId: string }>;
  /** Traduce el cuerpo del webhook del proveedor a eventos neutrales */
  parsearWebhook(body: unknown): EventosWebhook;
}
