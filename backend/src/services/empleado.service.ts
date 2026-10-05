import { withTransaction } from '../config/database.js';
import type { ActualizarEmpleadoDto, CrearEmpleadoDto, ListarEmpleadosQuery, ReemplazarHorariosDto } from '../dtos/empleado.dto.js';
import { CitaModel } from '../models/cita.model.js';
import { EmpleadoModel, type Empleado, type TramoHorario } from '../models/empleado.model.js';
import { AppError } from '../utils/app-error.js';
import { cancelarEnTransaccion } from './cita.service.js';
import { OutboxWorker } from './outbox.service.js';

export const EmpleadoService = {
  listar(query: ListarEmpleadosQuery): Promise<Empleado[]> {
    return EmpleadoModel.list({ incluirInactivos: query.incluir_inactivos });
  },

  async obtener(id: number): Promise<Empleado & { horarios: TramoHorario[] }> {
    const empleado = await EmpleadoModel.findById(id);
    if (!empleado) throw AppError.notFound('Empleado');
    return { ...empleado, horarios: await EmpleadoModel.getHorarios(id) };
  },

  async crear(dto: CrearEmpleadoDto) {
    return this.obtener(await EmpleadoModel.create(dto));
  },

  async actualizar(id: number, dto: ActualizarEmpleadoDto) {
    if (!(await EmpleadoModel.update(id, dto))) throw AppError.notFound('Empleado');
    return this.obtener(id);
  },

  async reactivar(id: number) {
    if (!(await EmpleadoModel.update(id, { activo: true }))) throw AppError.notFound('Empleado');
    return this.obtener(id);
  },

  /**
   * Baja del empleado. Con citas futuras activas se rechaza (409 con la lista)
   * salvo `cancelarCitas`, que las cancela y avisa a los clientes en la misma
   * transacción. Lo habitual es reprogramarlas antes con otro profesional.
   */
  async desactivar(id: number, { cancelarCitas }: { cancelarCitas: boolean }): Promise<void> {
    const ahora = new Date();
    const huboCancelaciones = await withTransaction(async (conn) => {
      if (!(await EmpleadoModel.lockById(id, conn))) throw AppError.notFound('Empleado');
      const futuras = await CitaModel.findActivasFuturas({ empleadoId: id }, ahora, conn);
      if (futuras.length && !cancelarCitas) {
        throw new AppError(
          `El profesional tiene ${futuras.length} cita(s) pendientes. Reprográmalas con otro profesional o cancélalas.`,
          409,
          'HAS_FUTURE_APPOINTMENTS',
          { citas: futuras.map((c) => ({ id: c.id, fecha_inicio: c.fecha_inicio, estado: c.estado })) },
        );
      }
      for (const cita of futuras) await cancelarEnTransaccion(conn, cita, 'Baja del profesional', 'manual', ahora);
      await EmpleadoModel.update(id, { activo: false }, conn);
      return futuras.length > 0;
    });
    if (huboCancelaciones) OutboxWorker.despertar();
  },

  /**
   * Sustituye el horario semanal de forma atómica (DELETE + INSERTs en una
   * transacción): nunca queda un horario a medias visible para las reservas.
   * Se bloquea al empleado para no cambiar su horario mientras se reserva.
   */
  async reemplazarHorarios(id: number, dto: ReemplazarHorariosDto): Promise<TramoHorario[]> {
    return withTransaction(async (conn) => {
      if (!(await EmpleadoModel.lockById(id, conn))) throw AppError.notFound('Empleado');
      await EmpleadoModel.replaceHorarios(id, dto.horarios, conn);
      return EmpleadoModel.getHorarios(id, conn);
    });
  },
} as const;
