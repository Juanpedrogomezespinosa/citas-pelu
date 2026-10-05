import type {
  ActualizarProductoDto,
  AnularCobroDto,
  CrearCobroDto,
  CrearProductoDto,
  ListarProductosQuery,
  RangoFechasQuery,
} from '../dtos/caja.dto.js';
import type { IdParams } from '../dtos/common.dto.js';
import { CobroService } from '../services/cobro.service.js';
import { ProductoService } from '../services/producto.service.js';
import { AppError } from '../utils/app-error.js';
import { action, ok } from '../utils/http.js';

export const ProductosController = {
  listar: action(async (req, res) => {
    ok(res, await ProductoService.listar(req.validatedQuery as ListarProductosQuery));
  }),

  crear: action(async (req, res) => {
    ok(res, await ProductoService.crear(req.validatedBody as CrearProductoDto), 201);
  }),

  actualizar: action(async (req, res) => {
    const { id } = req.validatedParams as IdParams;
    ok(res, await ProductoService.actualizar(id, req.validatedBody as ActualizarProductoDto));
  }),
} as const;

export const CobrosController = {
  listar: action(async (req, res) => {
    ok(res, await CobroService.listar(req.validatedQuery as RangoFechasQuery));
  }),

  obtener: action(async (req, res) => {
    const { id } = req.validatedParams as IdParams;
    ok(res, await CobroService.obtener(id));
  }),

  crear: action(async (req, res) => {
    if (!req.user) throw AppError.unauthorized();
    ok(res, await CobroService.crear(req.validatedBody as CrearCobroDto, req.user.id), 201);
  }),

  anular: action(async (req, res) => {
    const { id } = req.validatedParams as IdParams;
    ok(res, await CobroService.anular(id, req.validatedBody as AnularCobroDto));
  }),

  informe: action(async (req, res) => {
    ok(res, await CobroService.informe(req.validatedQuery as RangoFechasQuery));
  }),
} as const;
