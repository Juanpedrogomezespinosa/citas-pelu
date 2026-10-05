/**
 * Prueba de envío real con el proveedor configurado en el .env.
 *
 *   npm run whatsapp:test -- +34600111222                 # texto libre
 *   npm run whatsapp:test -- +34600111222 recordatorio    # plantilla aprobada
 *
 * Con Twilio sandbox, el número destino debe haberse unido antes al sandbox
 * ("join <palabra>"). Fuera de la ventana de 24 h, solo llegan plantillas.
 */
import { env } from '../config/env.js';
import { CLAVES_PLANTILLA, type ClavePlantilla } from '../models/notificacion.model.js';
import { getWhatsAppProvider, plantillasFaltantes } from '../services/whatsapp/index.js';
import { Mensajes } from '../services/whatsapp/mensajes.js';
import { normalizePhone } from '../utils/phone.js';

const [destino, clave] = process.argv.slice(2);
const to = destino ? normalizePhone(destino, { defaultCountryCode: env.WHATSAPP_DEFAULT_COUNTRY_CODE }) : null;

if (!to || (clave && !CLAVES_PLANTILLA.includes(clave as ClavePlantilla))) {
  console.error(`Uso: npm run whatsapp:test -- <teléfono> [${CLAVES_PLANTILLA.join('|')}]`);
  process.exit(1);
}

// Cita ficticia para rellenar la plantilla con datos verosímiles
const ejemplo = {
  cliente_nombre: 'Prueba',
  empleado_nombre: 'Equipo del salón',
  fecha_inicio: new Date(Date.now() + 24 * 3_600_000),
  servicios: [{ servicio_id: 0, nombre: 'Corte', categoria: 'corte', precio: 0, duracion_minutos: 30, notas_tecnicas: null }],
};
const ctx = { negocio: env.BUSINESS_NAME, timeZone: env.APP_TIMEZONE };
const constructores = {
  confirmacion: (c: typeof ejemplo) => Mensajes.confirmacionCita(c, ctx),
  recordatorio: (c: typeof ejemplo) => Mensajes.recordatorio(c, ctx),
  cambio: (c: typeof ejemplo) => Mensajes.cambioCita(c, ctx),
  cancelacion: (c: typeof ejemplo) => Mensajes.cancelacion(c, ctx),
};

const mensaje = clave ? constructores[clave as ClavePlantilla](ejemplo) : null;
const faltan = plantillasFaltantes();
if (clave && faltan.includes(clave as ClavePlantilla)) {
  console.warn(`⚠️  La plantilla "${clave}" no está configurada en el .env: se enviará como texto libre.`);
}

try {
  const { providerMessageId } = await getWhatsAppProvider().enviar({
    to,
    body: mensaje?.texto ?? `Mensaje de prueba de ${env.BUSINESS_NAME} ✅`,
    plantilla: mensaje?.plantilla,
  });
  console.log(`✅ Enviado con ${env.WHATSAPP_PROVIDER} a ${to}. Id del proveedor: ${providerMessageId}`);
} catch (error) {
  console.error(`❌ Error del proveedor: ${(error as Error).message}`);
  process.exitCode = 1;
}
