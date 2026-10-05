import type { ActualizarClienteDto, CrearClienteDto, DesactivarQuery, ListarClientesQuery } from '../dtos/cliente.dto.js';
import type { IdParams } from '../dtos/common.dto.js';
import { ClienteService } from '../services/cliente.service.js';
import { action, ok } from '../utils/http.js';

export const ClientesController = {
  listar: action(async (req, res) => {
    const { items, meta } = await ClienteService.listar(req.validatedQuery as ListarClientesQuery);
    ok(res, items, 200, meta);
  }),

  obtener: action(async (req, res) => {
    const { id } = req.validatedParams as IdParams;
    ok(res, await ClienteService.obtener(id));
  }),

  historial: action(async (req, res) => {
    const { id } = req.validatedParams as IdParams;
    ok(res, await ClienteService.historial(id));
  }),

  crear: action(async (req, res) => {
    ok(res, await ClienteService.crear(req.validatedBody as CrearClienteDto), 201);
  }),

  actualizar: action(async (req, res) => {
    const { id } = req.validatedParams as IdParams;
    ok(res, await ClienteService.actualizar(id, req.validatedBody as ActualizarClienteDto));
  }),

  desactivar: action(async (req, res) => {
    const { id } = req.validatedParams as IdParams;
    const { cancelar_citas } = req.validatedQuery as DesactivarQuery;
    await ClienteService.desactivar(id, { cancelarCitas: cancelar_citas ?? false });
    res.status(204).end();
  }),

  reactivar: action(async (req, res) => {
    const { id } = req.validatedParams as IdParams;
    ok(res, await ClienteService.reactivar(id));
  }),

  /** RGPD: descarga de todos los datos del cliente */
  exportar: action(async (req, res) => {
    const { id } = req.validatedParams as IdParams;
    const datos = await ClienteService.exportar(id);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', `attachment; filename="cliente-${id}-datos.json"`);
    ok(res, datos);
  }),

  anonimizar: action(async (req, res) => {
    const { id } = req.validatedParams as IdParams;
    ok(res, await ClienteService.anonimizar(id));
  }),
} as const;
