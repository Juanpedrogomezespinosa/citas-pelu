import type { CrearBloqueoDto, ListarBloqueosQuery } from '../dtos/bloqueo.dto.js';
import type { IdParams } from '../dtos/common.dto.js';
import { BloqueoService } from '../services/bloqueo.service.js';
import { AppError } from '../utils/app-error.js';
import { action, ok } from '../utils/http.js';

export const BloqueosController = {
  listar: action(async (req, res) => {
    ok(res, await BloqueoService.listar(req.validatedQuery as ListarBloqueosQuery));
  }),

  crear: action(async (req, res) => {
    if (!req.user) throw AppError.unauthorized();
    ok(res, await BloqueoService.crear(req.validatedBody as CrearBloqueoDto, req.user.id), 201);
  }),

  eliminar: action(async (req, res) => {
    const { id } = req.validatedParams as IdParams;
    await BloqueoService.eliminar(id);
    res.status(204).end();
  }),
} as const;
