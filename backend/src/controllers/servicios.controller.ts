import type { IdParams } from '../dtos/common.dto.js';
import type { ActualizarServicioDto, CrearServicioDto, ListarServiciosQuery } from '../dtos/servicio.dto.js';
import { ServicioService } from '../services/servicio.service.js';
import { action, ok } from '../utils/http.js';

export const ServiciosController = {
  listar: action(async (req, res) => {
    ok(res, await ServicioService.listar(req.validatedQuery as ListarServiciosQuery));
  }),

  obtener: action(async (req, res) => {
    const { id } = req.validatedParams as IdParams;
    ok(res, await ServicioService.obtener(id));
  }),

  crear: action(async (req, res) => {
    ok(res, await ServicioService.crear(req.validatedBody as CrearServicioDto), 201);
  }),

  actualizar: action(async (req, res) => {
    const { id } = req.validatedParams as IdParams;
    ok(res, await ServicioService.actualizar(id, req.validatedBody as ActualizarServicioDto));
  }),

  desactivar: action(async (req, res) => {
    const { id } = req.validatedParams as IdParams;
    await ServicioService.desactivar(id);
    res.status(204).end();
  }),
} as const;
