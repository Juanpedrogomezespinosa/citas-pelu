import type { IdParams } from '../dtos/common.dto.js';
import type { ListarNotificacionesQuery } from '../dtos/notificacion.dto.js';
import { NotificacionService } from '../services/notificacion.service.js';
import { action, ok } from '../utils/http.js';

export const NotificacionesController = {
  listar: action(async (req, res) => {
    const { items, meta } = await NotificacionService.listar(req.validatedQuery as ListarNotificacionesQuery);
    ok(res, items, 200, meta);
  }),

  obtener: action(async (req, res) => {
    const { id } = req.validatedParams as IdParams;
    ok(res, await NotificacionService.obtener(id));
  }),

  reintentar: action(async (req, res) => {
    const { id } = req.validatedParams as IdParams;
    ok(res, await NotificacionService.reintentar(id));
  }),
} as const;
