import type { DesactivarQuery } from '../dtos/cliente.dto.js';
import type { IdParams } from '../dtos/common.dto.js';
import type { ActualizarEmpleadoDto, CrearEmpleadoDto, ListarEmpleadosQuery, ReemplazarHorariosDto } from '../dtos/empleado.dto.js';
import { EmpleadoService } from '../services/empleado.service.js';
import { action, ok } from '../utils/http.js';

export const EmpleadosController = {
  listar: action(async (req, res) => {
    ok(res, await EmpleadoService.listar(req.validatedQuery as ListarEmpleadosQuery));
  }),

  obtener: action(async (req, res) => {
    const { id } = req.validatedParams as IdParams;
    ok(res, await EmpleadoService.obtener(id));
  }),

  crear: action(async (req, res) => {
    ok(res, await EmpleadoService.crear(req.validatedBody as CrearEmpleadoDto), 201);
  }),

  actualizar: action(async (req, res) => {
    const { id } = req.validatedParams as IdParams;
    ok(res, await EmpleadoService.actualizar(id, req.validatedBody as ActualizarEmpleadoDto));
  }),

  desactivar: action(async (req, res) => {
    const { id } = req.validatedParams as IdParams;
    const { cancelar_citas } = req.validatedQuery as DesactivarQuery;
    await EmpleadoService.desactivar(id, { cancelarCitas: cancelar_citas ?? false });
    res.status(204).end();
  }),

  reactivar: action(async (req, res) => {
    const { id } = req.validatedParams as IdParams;
    ok(res, await EmpleadoService.reactivar(id));
  }),

  reemplazarHorarios: action(async (req, res) => {
    const { id } = req.validatedParams as IdParams;
    ok(res, await EmpleadoService.reemplazarHorarios(id, req.validatedBody as ReemplazarHorariosDto));
  }),
} as const;
