/**
 * Se carga con --import ANTES que la aplicación: fija la configuración de los
 * tests de integración (dotenv no sobrescribe variables ya definidas).
 *
 * Usa una base de datos propia (TEST_DB_NAME, por defecto peluqueria_test) que
 * se BORRA Y RECREA en cada ejecución. El usuario necesita permiso para crear
 * bases de datos (root en local; en CI, el servicio MySQL del workflow).
 */
const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  DB_HOST: process.env['TEST_DB_HOST'] ?? '127.0.0.1',
  DB_PORT: process.env['TEST_DB_PORT'] ?? '3306',
  DB_USER: process.env['TEST_DB_USER'] ?? 'root',
  DB_PASSWORD: process.env['TEST_DB_PASSWORD'] ?? '',
  DB_NAME: process.env['TEST_DB_NAME'] ?? 'peluqueria_test',
  JWT_SECRET: 'test-secret-de-al-menos-treinta-y-dos-caracteres-0123456789',
  JWT_EXPIRES_IN: '1h',
  CORS_ORIGINS: 'http://localhost:4321',
  PUBLIC_BASE_URL: 'http://localhost:4000',
  WHATSAPP_PROVIDER: 'console',
  WHATSAPP_SIMULATOR_ENABLED: 'true',
  REMINDER_ENABLED: 'false',
  REDIS_URL: '',
  METRICS_TOKEN: 'token-de-metricas-para-tests',
  BUSINESS_OPEN_TIME: '09:00',
  BUSINESS_CLOSE_TIME: '20:00',
  APP_TIMEZONE: 'Europe/Madrid',
};

for (const [clave, valor] of Object.entries(defaults)) process.env[clave] = valor;
