/**
 * Carga y valida las variables de entorno UNA sola vez al arrancar.
 *
 * Decisión de diseño: fallar rápido. Si falta una variable crítica (secreto JWT,
 * credenciales del proveedor de WhatsApp elegido...), el proceso no arranca y
 * dice exactamente qué falta, en lugar de fallar en mitad de una petición.
 */
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Formato HH:mm');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    APP_TIMEZONE: z.string().default('Europe/Madrid'),
    CORS_ORIGINS: z.string().default('http://localhost:4321'),
    PUBLIC_BASE_URL: z.url().default('http://localhost:4000'),
    /**
     * Nº de proxies de confianza delante de la API (para obtener la IP real del
     * cliente en el rate limiting). 'false'/0: ninguno; 'true': 1 (solo nginx);
     * con un proxy TLS delante de nginx: 2. Un valor demasiado bajo hace que
     * todos los usuarios compartan IP (y límite de login); demasiado alto
     * permite falsear la IP con X-Forwarded-For.
     */
    TRUST_PROXY: z
      .string()
      .default('false')
      .transform((v) => (v === 'true' ? 1 : v === 'false' ? 0 : Number(v)))
      .pipe(z.number().int().min(0).max(5)),

    DB_HOST: z.string().default('localhost'),
    DB_PORT: z.coerce.number().int().positive().default(3306),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string().default(''),
    DB_NAME: z.string().min(1),
    DB_CONNECTION_LIMIT: z.coerce.number().int().positive().default(10),

    JWT_SECRET: z.string().min(32, 'Debe tener al menos 32 caracteres'),
    JWT_EXPIRES_IN: z
      .string()
      .regex(/^\d+[smhd]$/, 'Formato: 30m, 8h, 7d...')
      .default('8h'),

    ADMIN_NAME: z.string().default('Administrador'),
    ADMIN_EMAIL: z.string().optional(),
    ADMIN_PASSWORD: z.string().optional(),

    BUSINESS_NAME: z.string().default('Peluquería'),
    BUSINESS_OPEN_TIME: hhmm.default('09:00'),
    BUSINESS_CLOSE_TIME: hhmm.default('20:00'),
    SLOT_INTERVAL_MINUTES: z.coerce.number().int().min(5).max(120).default(15),

    WHATSAPP_PROVIDER: z.enum(['console', 'twilio', 'meta']).default('console'),
    WHATSAPP_DEFAULT_COUNTRY_CODE: z
      .string()
      .regex(/^\d{1,3}$/)
      .default('34'),
    /** Endpoint de simulación de mensajes entrantes: opt-in explícito, nunca en producción */
    WHATSAPP_SIMULATOR_ENABLED: bool,

    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_WHATSAPP_FROM: z.string().optional(),
    // Content SID de las plantillas aprobadas (una por tipo de mensaje)
    TWILIO_CONTENT_SID_CONFIRMACION: z.string().optional(),
    TWILIO_CONTENT_SID_RECORDATORIO: z.string().optional(),
    TWILIO_CONTENT_SID_CAMBIO: z.string().optional(),
    TWILIO_CONTENT_SID_CANCELACION: z.string().optional(),

    META_ACCESS_TOKEN: z.string().optional(),
    META_PHONE_NUMBER_ID: z.string().optional(),
    META_VERIFY_TOKEN: z.string().optional(),
    META_APP_SECRET: z.string().optional(),
    META_API_VERSION: z.string().default('v21.0'),
    // Nombre de las plantillas aprobadas en Meta (una por tipo de mensaje)
    META_TEMPLATE_CONFIRMACION: z.string().optional(),
    META_TEMPLATE_RECORDATORIO: z.string().optional(),
    META_TEMPLATE_CAMBIO: z.string().optional(),
    META_TEMPLATE_CANCELACION: z.string().optional(),
    META_TEMPLATE_LANGUAGE: z.string().default('es'),

    REMINDER_ENABLED: bool,
    REMINDER_HOURS_BEFORE: z.coerce.number().int().min(1).max(168).default(24),
    REMINDER_CRON: z.string().default('*/10 * * * *'),

    /** Cada cuántos segundos revisa el worker la cola de notificaciones (outbox) */
    OUTBOX_INTERVAL_SECONDS: z.coerce.number().int().min(1).max(600).default(15),

    /** Redis para el rate limiting compartido entre instancias (opcional) */
    REDIS_URL: z.string().optional(),

    /** Token para GET /api/metrics (Prometheus). Sin token, el endpoint no existe. */
    METRICS_TOKEN: z.string().min(16).optional(),

    /** RGPD: anonimizar automáticamente clientes sin actividad en N meses */
    RGPD_ANONIMIZACION_AUTOMATICA: bool,
    RGPD_RETENCION_MESES: z.coerce.number().int().min(12).max(240).default(36),
  })
  .superRefine((env, ctx) => {
    // Credenciales obligatorias solo para el proveedor elegido
    const required: Record<typeof env.WHATSAPP_PROVIDER, (keyof typeof env)[]> = {
      twilio: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM'],
      meta: ['META_ACCESS_TOKEN', 'META_PHONE_NUMBER_ID', 'META_VERIFY_TOKEN', 'META_APP_SECRET'],
      console: [],
    };
    for (const key of required[env.WHATSAPP_PROVIDER]) {
      if (!env[key]) {
        ctx.addIssue({ code: 'custom', path: [key], message: `Obligatoria con WHATSAPP_PROVIDER=${env.WHATSAPP_PROVIDER}` });
      }
    }
    if (env.NODE_ENV === 'production' && env.WHATSAPP_SIMULATOR_ENABLED) {
      ctx.addIssue({ code: 'custom', path: ['WHATSAPP_SIMULATOR_ENABLED'], message: 'No se permite en producción' });
    }
    if (env.BUSINESS_OPEN_TIME >= env.BUSINESS_CLOSE_TIME) {
      ctx.addIssue({ code: 'custom', path: ['BUSINESS_CLOSE_TIME'], message: 'Debe ser posterior a BUSINESS_OPEN_TIME' });
    }
  });

export type Env = z.infer<typeof envSchema>;

// Los valores vacíos del .env ("CLAVE=") se tratan como no definidos.
const raw = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== ''));
const parsed = envSchema.safeParse(raw);

if (!parsed.success) {
  console.error('❌ Configuración inválida en .env:');
  for (const issue of parsed.error.issues) {
    console.error(`   - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env: Readonly<Env> = Object.freeze(parsed.data);
export const isProduction = env.NODE_ENV === 'production';

// Todas las fechas "naive" (DATETIME de MySQL, 'YYYY-MM-DDTHH:mm' del frontend)
// se interpretan en la zona horaria del salón: un único local => una única zona.
process.env.TZ = env.APP_TIMEZONE;
