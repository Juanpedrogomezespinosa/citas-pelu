import type {
  ActualizarCitaDto,
  CambiarEstadoDto,
  CancelarCitaDto,
  CompletarCitaDto,
  CrearCitaDto,
  DisponibilidadQuery,
  ListarCitasQuery,
  NotasTecnicasDto,
} from '../dtos/cita.dto.js';
import type { IdParams } from '../dtos/common.dto.js';
import { CitaService } from '../services/cita.service.js';
import { NotificacionService } from '../services/notificacion.service.js';
import { action, ok } from '../utils/http.js';

export const CitasController = {
  listar: action(async (req, res) => {
    const { items, meta } = await CitaService.listar(req.validatedQuery as ListarCitasQuery);
    ok(res, items, 200, meta);
  }),

  disponibilidad: action(async (req, res) => {
    ok(res, await CitaService.disponibilidad(req.validatedQuery as DisponibilidadQuery));
  }),

  obtener: action(async (req, res) => {
    const { id } = req.validatedParams as IdParams;
    ok(res, await CitaService.obtener(id));
  }),

  crear: action(async (req, res) => {
    ok(res, await CitaService.crear(req.validatedBody as CrearCitaDto, req.user?.id ?? null), 201);
  }),

  actualizar: action(async (req, res) => {
    const { id } = req.validatedParams as IdParams;
    ok(res, await CitaService.actualizar(id, req.validatedBody as ActualizarCitaDto));
  }),

  cambiarEstado: action(async (req, res) => {
    const { id } = req.validatedParams as IdParams;
    const { estado } = req.validatedBody as CambiarEstadoDto;
    ok(res, await CitaService.cambiarEstado(id, estado, 'manual'));
  }),

  completar: action(async (req, res) => {
    const { id } = req.validatedParams as IdParams;
    ok(res, await CitaService.completar(id, req.validatedBody as CompletarCitaDto));
  }),

  actualizarNotasTecnicas: action(async (req, res) => {
    const { id } = req.validatedParams as IdParams;
    ok(res, await CitaService.actualizarNotasTecnicas(id, req.validatedBody as NotasTecnicasDto));
  }),

  cancelar: action(async (req, res) => {
    const { id } = req.validatedParams as IdParams;
    const { motivo } = req.validatedBody as CancelarCitaDto;
    ok(res, await CitaService.cancelar(id, motivo ?? null, 'manual'));
  }),

  /** Si el proveedor falla, la notificación vuelve con su estado y error (y se reintentará sola) */
  enviarRecordatorio: action(async (req, res) => {
    const { id } = req.validatedParams as IdParams;
    ok(res, await NotificacionService.enviarRecordatorioManual(id));
  }),
} as const;
