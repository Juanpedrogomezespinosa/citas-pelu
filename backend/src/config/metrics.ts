/**
 * Métricas Prometheus (GET /api/metrics, protegido con METRICS_TOKEN).
 * Reglas de alerta de ejemplo en ops/prometheus/alertas.yml.
 */
import type { NextFunction, Request, Response } from 'express';
import client from 'prom-client';
import { NotificacionModel } from '../models/notificacion.model.js';

export const registro = new client.Registry();
registro.setDefaultLabels({ app: 'peluqueria-api' });
client.collectDefaultMetrics({ register: registro });

const peticiones = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duración de las peticiones HTTP',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registro],
});

export const metricas = {
  whatsappEnvios: new client.Counter({
    name: 'whatsapp_envios_total',
    help: 'Intentos de envío de WhatsApp por resultado',
    labelNames: ['resultado', 'tipo'] as const,
    registers: [registro],
  }),
  citasCreadas: new client.Counter({
    name: 'citas_creadas_total',
    help: 'Citas reservadas',
    registers: [registro],
  }),
} as const;

// Estado de la cola: se consulta a la BD solo cuando Prometheus pide las métricas
new client.Gauge({
  name: 'outbox_pendientes',
  help: 'Mensajes de WhatsApp en cola pendientes de envío',
  registers: [registro],
  async collect() {
    this.set((await NotificacionModel.estadoCola(new Date())).pendientes);
  },
});
new client.Gauge({
  name: 'outbox_antiguedad_segundos',
  help: 'Antigüedad del mensaje pendiente más viejo de la cola',
  registers: [registro],
  async collect() {
    this.set((await NotificacionModel.estadoCola(new Date())).antiguedad_max_s);
  },
});

/** Mide la duración de cada petición etiquetada con la RUTA (no la URL: evita cardinalidad infinita) */
export function medirPeticiones(req: Request, res: Response, next: NextFunction): void {
  const fin = peticiones.startTimer();
  res.on('finish', () => {
    const route = (req.route as { path?: string } | undefined)?.path;
    fin({ method: req.method, route: route ? `${req.baseUrl}${route}` : 'sin_ruta', status: String(res.statusCode) });
  });
  next();
}
