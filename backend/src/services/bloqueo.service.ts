/**
 * Bloqueos de agenda (vacaciones, festivos, bajas...).
 *
 * Invariante: un bloqueo nunca se solapa con citas activas. Si las hay, se
 * rechaza con la lista de citas afectadas para que recepción las reprograme o
 * cancele primero (decisión que corresponde a una persona, no al sistema).
 */
import { withTransaction } from '../config/database.js';
import type { CrearBloqueoDto, ListarBloqueosQuery } from '../dtos/bloqueo.dto.js';
import { BloqueoModel, type Bloqueo } from '../models/bloqueo.model.js';
import { CitaModel } from '../models/cita.model.js';
import { EmpleadoModel } from '../models/empleado.model.js';
import { AppError } from '../utils/app-error.js';
import { addDays, parseLocalDate, parseLocalDateTime } from '../utils/dates.js';

export const BloqueoService = {
  listar(query: ListarBloqueosQuery): Promise<Bloqueo[]> {
    const desde = parseLocalDate(query.desde);
    const hasta = parseLocalDate(query.hasta);
    if (!desde || !hasta) throw AppError.badRequest('Fecha no válida', 'INVALID_DATE');
    return BloqueoModel.list({ desde, hasta: addDays(hasta, 1), empleadoId: query.empleado_id });
  },

  async crear(dto: CrearBloqueoDto, usuarioId: number): Promise<Bloqueo> {
    const inicio = parseLocalDateTime(dto.fecha_inicio);
    const fin = parseLocalDateTime(dto.fecha_fin);
    if (!inicio || !fin) throw AppError.badRequest('Fecha no válida', 'INVALID_DATE');
    if (fin <= inicio) throw AppError.badRequest('La fecha de fin debe ser posterior a la de inicio', 'INVALID_RANGE');

    const id = await withTransaction(async (conn) => {
      // Mismo cerrojo que las reservas: ninguna cita puede colarse mientras
      // comprobamos y creamos el bloqueo. Para un festivo (todo el local) se
      // bloquean todas las agendas, en orden de id para evitar interbloqueos.
      if (dto.empleado_id) {
        if (!(await EmpleadoModel.lockById(dto.empleado_id, conn))) throw AppError.notFound('Empleado');
      } else {
        for (const e of await EmpleadoModel.list({ incluirInactivos: true }, conn)) await EmpleadoModel.lockById(e.id, conn);
      }

      const afectadas = await CitaModel.findActivasEnRango(dto.empleado_id ?? null, inicio, fin, conn);
      if (afectadas.length > 0) {
        throw new AppError(
          `Hay ${afectadas.length} cita(s) activas en ese periodo. Reprográmalas o cancélalas antes de bloquear la agenda.`,
          409,
          'HAS_APPOINTMENTS',
          { citas: afectadas },
        );
      }

      return BloqueoModel.insert(
        {
          empleado_id: dto.empleado_id ?? null,
          tipo: dto.tipo,
          fecha_inicio: inicio,
          fecha_fin: fin,
          motivo: dto.motivo ?? null,
          creado_por: usuarioId,
        },
        conn,
      );
    });

    const bloqueo = await BloqueoModel.findById(id);
    if (!bloqueo) throw new AppError('No se pudo crear el bloqueo');
    return bloqueo;
  },

  async eliminar(id: number): Promise<void> {
    if (!(await BloqueoModel.delete(id))) throw AppError.notFound('Bloqueo');
  },
} as const;
