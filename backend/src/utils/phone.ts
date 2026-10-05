/**
 * Normalización de teléfonos a E.164 (+34600111222).
 *
 * Guardar SIEMPRE el mismo formato es imprescindible: los webhooks de WhatsApp
 * identifican al remitente por su número y así lo casamos con el cliente.
 */
const E164 = /^\+[1-9]\d{7,14}$/;

export interface NormalizeOptions {
  /** Prefijo de país a añadir si el número no lo trae (p. ej. '34') */
  defaultCountryCode: string;
  /** El número ya incluye prefijo aunque no lleve '+' (así lo envía Meta) */
  assumeInternational?: boolean;
}

/**
 * Acepta "600 11 12 22", "0034600111222", "whatsapp:+34600111222", "34600111222"...
 * @returns número E.164 o null si no es válido
 */
export function normalizePhone(raw: string, { defaultCountryCode, assumeInternational = false }: NormalizeOptions): string | null {
  let phone = raw
    .trim()
    .replace(/^whatsapp:/i, '')
    .replace(/[\s\-().]/g, '');

  if (phone.startsWith('00')) phone = `+${phone.slice(2)}`;
  if (!phone.startsWith('+')) {
    phone = assumeInternational ? `+${phone}` : `+${defaultCountryCode}${phone}`;
  }
  return E164.test(phone) ? phone : null;
}
