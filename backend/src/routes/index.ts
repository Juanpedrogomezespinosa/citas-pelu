import { timingSafeEqual } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { pingDatabase } from '../config/database.js';
import { env } from '../config/env.js';
import { registro } from '../config/metrics.js';
import { pingRedis } from '../config/redis.js';
import { NotificacionModel } from '../models/notificacion.model.js';
import { authRoutes } from './auth.routes.js';
import { bloqueosRoutes } from './bloqueos.routes.js';
import { cobrosRoutes, informesRoutes, productosRoutes } from './caja.routes.js';
import { citasRoutes } from './citas.routes.js';
import { clientesRoutes } from './clientes.routes.js';
import { empleadosRoutes } from './empleados.routes.js';
import { notificacionesRoutes } from './notificaciones.routes.js';
import { serviciosRoutes } from './servicios.routes.js';
import { usuariosRoutes } from './usuarios.routes.js';
import { webhooksRoutes } from './webhooks.routes.js';

/** Cola de WhatsApp "atascada" si el mensaje pendiente más viejo supera este tiempo */
const OUTBOX_MAX_ANTIGUEDAD_S = 15 * 60;

/** Liveness: el proceso responde (para reiniciarlo si se cuelga) */
function vivo(_req: Request, res: Response): void {
  res.json({ success: true, data: { status: 'ok' } });
}

/** Readiness: dependencias OK (para balanceadores y monitorización) */
async function listo(_req: Request, res: Response): Promise<void> {
  const [db, redis] = await Promise.all([
    pingDatabase().then(
      () => 'ok' as const,
      () => 'error' as const,
    ),
    pingRedis(),
  ]);
  const outbox = db === 'ok' ? await NotificacionModel.estadoCola(new Date()).catch(() => null) : null;
  const outboxOk = outbox !== null && outbox.antiguedad_max_s < OUTBOX_MAX_ANTIGUEDAD_S;
  const ok = db === 'ok' && redis !== 'error' && outboxOk;
  res.status(ok ? 200 : 503).json({ success: ok, data: { status: ok ? 'ok' : 'degraded', db, redis, outbox } });
}

/** Métricas Prometheus: solo si hay METRICS_TOKEN, y exigiéndolo */
async function metrics(req: Request, res: Response): Promise<void> {
  const recibido = Buffer.from(req.get('authorization') ?? '');
  const esperado = Buffer.from(`Bearer ${env.METRICS_TOKEN}`);
  // Comparación en tiempo constante (no filtra el token por temporización)
  if (recibido.length !== esperado.length || !timingSafeEqual(recibido, esperado)) {
    res.status(401).end();
    return;
  }
  res.type(registro.contentType).send(await registro.metrics());
}

export const apiRoutes = Router()
  .get('/health', vivo)
  .get('/health/ready', listo)
  .use('/auth', authRoutes)
  .use('/usuarios', usuariosRoutes)
  .use('/clientes', clientesRoutes)
  .use('/servicios', serviciosRoutes)
  .use('/empleados', empleadosRoutes)
  .use('/bloqueos', bloqueosRoutes)
  .use('/citas', citasRoutes)
  .use('/productos', productosRoutes)
  .use('/cobros', cobrosRoutes)
  .use('/informes', informesRoutes)
  .use('/notificaciones', notificacionesRoutes)
  .use('/webhooks', webhooksRoutes);

if (env.METRICS_TOKEN) apiRoutes.get('/metrics', metrics);
