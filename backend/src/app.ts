/**
 * Configuración de la aplicación Express (sin arrancar el servidor, para
 * poder usarla en los tests de integración con supertest).
 */
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env, isProduction } from './config/env.js';
import { medirPeticiones } from './config/metrics.js';
import { crearCsrfGuard } from './middleware/csrf.middleware.js';
import { errorHandler, notFound } from './middleware/error.middleware.js';
import { apiLimiter } from './middleware/rate-limit.middleware.js';
import { apiRoutes } from './routes/index.js';

export function createApp(): Express {
  const app = express();

  // Detrás de un proxy (nginx, ngrok...) para que la IP real llegue al rate limiter
  if (env.TRUST_PROXY > 0) app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');

  // Cabeceras de seguridad (CSP, HSTS, noSniff, frameguard...)
  app.use(helmet());

  // CORS con lista blanca explícita y credenciales (cookie de sesión).
  // Las peticiones sin Origin (webhooks, curl, mismo origen) se permiten:
  // no son peticiones cross-origin de un navegador.
  const allowedOrigins = new Set(
    env.CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  );
  app.use(
    cors({
      origin(origin, callback) {
        callback(null, !origin || allowedOrigins.has(origin));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    }),
  );

  // Límite de tamaño del body. `verify` guarda el cuerpo crudo: Meta firma
  // los bytes exactos, no el JSON re-serializado.
  app.use(
    express.json({
      limit: '100kb',
      verify: (req, _res, buf) => {
        (req as express.Request).rawBody = buf;
      },
    }),
  );
  // Twilio envía los webhooks como formulario urlencoded
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(cookieParser());

  if (env.NODE_ENV !== 'test') app.use(morgan(isProduction ? 'combined' : 'dev'));
  app.use(medirPeticiones);

  app.use('/api', apiLimiter, crearCsrfGuard(allowedOrigins), apiRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
