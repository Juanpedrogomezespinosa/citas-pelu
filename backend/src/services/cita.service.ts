/**
 * Reglas de negocio de las citas. Aquí se garantiza la integridad ACID:
 *
 *  Atomicidad   -> cada operación va en withTransaction(); el aviso de WhatsApp
 *                  se encola en la MISMA transacción (outbox).
 *  Consistencia -> se validan invariantes (horario, bloqueos, estado, servicios
 *                  activos) ANTES de escribir; la BD remata con FKs y CHECKs.
 *  Aislamiento  -> SELECT ... FOR UPDATE sobre el empleado serializa las
 *                  reservas de su agenda (sin dobles reservas), y `version`
 *                  detecta ediciones concurrentes de la misma cita.
 *  Durabilidad  -> se responde al cliente solo después del COMMIT.
 *
 * Las funciones `...EnTransaccion` reciben la conexión de una transacción ya
 * abierta: así otros servicios (bajas, WhatsApp entrante) componen varias
 * operaciones en una sola unidad atómica.
 */
import type { PoolConnection } from 'mysql2/promise';
import { env } from '../config/env.js';
import { withTransaction } from '../config/database.js';
import { metricas } from '../config/metrics.js';
import type {
  ActualizarCitaDto,
  CompletarCitaDto,
  CrearCitaDto,
  DisponibilidadQuery,
  ListarCitasQuery,
  NotasTecnicasDto,
} from '../dtos/cita.dto.js';
import { BloqueoModel } from '../models/bloqueo.model.js';
import {
  CitaModel,
  ESTADOS_ACTIVOS,
  TRANSICIONES,
  type Cita,
  type CitaDetalle,
  type CitaUpdate,
  type EstadoCita,
} from '../models/cita.model.js';
import { ClienteModel } from '../models/cliente.model.js';
import { EmpleadoModel } from '../models/empleado.model.js';
import { ServicioModel, type Servicio } from '../models/servicio.model.js';
import { AppError } from '../utils/app-error.js';
import { addDays, addMinutes, parseLocalDate, parseLocalDateTime } from '../utils/dates.js';
import { buildMeta, type Paginated } from '../utils/pagination.js';
import { calcularHuecos, encajaEnVentanas, ventanasLaborables } from './agenda.js';
import { encolarAvisoCita, OutboxWorker } from './outbox.service.js';

const NEGOCIO = { apertura: env.BUSINESS_OPEN_TIME, cierre: env.BUSINESS_CLOSE_TIME } as const;

export type OrigenCambio = 'manual' | 'whatsapp';

const ETIQUETA_BLOQUEO = {
  vacaciones: 'de vacaciones',
  festivo: 'cerrado (festivo)',
  baja: 'de baja',
  formacion: 'en formación',
  otro: 'no disponible',
} as const;

// ---------------------------------------------------------------------------
// Helpers internos (siempre dentro de una transacción: reciben `conn`)
// ---------------------------------------------------------------------------

function parseInicio(value: string): Date {
  const inicio = parseLocalDateTime(value);
  if (!inicio) throw AppError.badRequest('Fecha de inicio no válida', 'INVALID_DATE');
  return inicio;
}

async function bloquearEmpleadoActivo(empleadoId: number, conn: PoolConnection): Promise<void> {
  const empleado = await EmpleadoModel.lockById(empleadoId, conn);
  if (!empleado) throw AppError.notFound('Empleado');
  if (!empleado.activo) throw AppError.badRequest('El empleado no está activo', 'INACTIVE_EMPLOYEE');
}

/** Bloquea varias agendas siempre en orden ascendente de id: evita interbloqueos */
async function bloquearEmpleados(ids: readonly number[], conn: PoolConnection): Promise<void> {
  for (const id of [...new Set(ids)].sort((a, b) => a - b)) {
    await bloquearEmpleadoActivo(id, conn);
  }
}

async function resolverServicios(ids: readonly number[], conn: PoolConnection): Promise<{ servicios: Servicio[]; duracion: number }> {
  const servicios = await ServicioModel.findActiveByIds(ids, conn, { forShare: true });
  if (servicios.length !== ids.length) {
    throw AppError.badRequest('Algún servicio no existe o no está activo', 'INVALID_SERVICE');
  }
  return { servicios, duracion: servicios.reduce((total, s) => total + s.duracion_minutos, 0) };
}

/** Invariantes de agenda: futuro, dentro de horario, sin bloqueos y sin solapes */
async function validarAgenda(
  conn: PoolConnection,
  p: { empleadoId: number; inicio: Date; fin: Date; excluirCitaId: number | null; ahora: Date },
): Promise<void> {
  if (p.inicio <= p.ahora) {
    throw AppError.badRequest('No se pueden reservar citas en el pasado', 'PAST_DATE');
  }
  const horarios = await EmpleadoModel.getHorarios(p.empleadoId, conn);
  if (!encajaEnVentanas(p.inicio, p.fin, ventanasLaborables(p.inicio.getDay(), horarios, NEGOCIO))) {
    throw AppError.badRequest('La cita queda fuera del horario del empleado', 'OUT_OF_HOURS');
  }
  const bloqueo = await BloqueoModel.findQueAfecta(p.empleadoId, p.inicio, p.fin, conn);
  if (bloqueo) {
    const quien = bloqueo.empleado_id ? 'El profesional está' : 'El salón está';
    throw AppError.conflict(`${quien} ${ETIQUETA_BLOQUEO[bloqueo.tipo]} en ese horario`, 'BLOCKED');
  }
  if (await CitaModel.findSolape(p.empleadoId, p.inicio, p.fin, p.excluirCitaId, conn)) {
    throw AppError.conflict('El empleado ya tiene una cita en ese horario', 'SLOT_UNAVAILABLE');
  }
}

function assertTransicion(cita: Cita, nuevo: EstadoCita): void {
  if (!TRANSICIONES[cita.estado].includes(nuevo)) {
    throw AppError.conflict(`No se puede pasar una cita de "${cita.estado}" a "${nuevo}"`, 'INVALID_TRANSITION');
  }
}

export async function bloquearCita(id: number, conn: PoolConnection): Promise<Cita> {
  const cita = await CitaModel.lockById(id, conn);
  if (!cita) throw AppError.notFound('Cita');
  return cita;
}

/** Aplica el UPDATE con bloqueo optimista o lanza 409 */
async function guardar(cita: Cita, cambios: CitaUpdate, conn: PoolConnection): Promise<void> {
  if (!(await CitaModel.update(cita.id, cita.version, cambios, conn))) {
    throw AppError.conflict('La cita ha sido modificada por otra persona. Recarga e inténtalo de nuevo.', 'VERSION_CONFLICT');
  }
}

async function detalleOrFail(id: number): Promise<CitaDetalle> {
  const cita = await CitaModel.findDetalle(id);
  if (!cita) throw AppError.notFound('Cita');
  return cita;
}

// ---------------------------------------------------------------------------
// Operaciones componibles dentro de una transacción ya abierta
// ---------------------------------------------------------------------------

type EstadoManual = Exclude<EstadoCita, 'pendiente' | 'cancelada'>;

/** Transición de estado (idempotente: pedir el estado actual no es un error) */
export async function cambiarEstadoEnTransaccion(
  conn: PoolConnection,
  cita: Cita,
  estado: EstadoManual,
  origen: OrigenCambio,
  ahora: Date,
): Promise<boolean> {
  if (cita.estado === estado) return false;
  assertTransicion(cita, estado);

  if ((estado === 'completada' || estado === 'no_asistio') && cita.fecha_inicio > ahora) {
    throw AppError.conflict('La cita aún no ha empezado', 'NOT_STARTED');
  }
  const cambios: CitaUpdate = { estado };
  if (estado === 'confirmada') {
    cambios.confirmada_via = origen;
    cambios.confirmada_en = ahora;
  }
  if (estado === 'completada') cambios.completada_en = ahora;
  await guardar(cita, cambios, conn);
  return true;
}

/**
 * Cancela y, si la cancelación no la pidió el propio cliente por WhatsApp
 * (que ya recibe la respuesta automática), encola el aviso.
 */
export async function cancelarEnTransaccion(
  conn: PoolConnection,
  cita: Cita,
  motivo: string | null,
  origen: OrigenCambio,
  ahora: Date,
): Promise<boolean> {
  if (cita.estado === 'cancelada') return false; // idempotente
  assertTransicion(cita, 'cancelada');
  await guardar(cita, { estado: 'cancelada', cancelada_en: ahora, motivo_cancelacion: motivo }, conn);
  if (origen === 'manual') await encolarAvisoCita(conn, cita.id, 'cancelacion', `cancelacion:${cita.id}`);
  return true;
}

// ---------------------------------------------------------------------------
// API pública del servicio
// ---------------------------------------------------------------------------

export const CitaService = {
  async listar(query: ListarCitasQuery): Promise<Paginated<CitaDetalle>> {
    const desde = query.desde ? parseLocalDate(query.desde) : null;
    const hasta = query.hasta ? parseLocalDate(query.hasta) : null;
    if ((query.desde && !desde) || (query.hasta && !hasta)) throw AppError.badRequest('Fecha no válida', 'INVALID_DATE');

    const { items, total } = await CitaModel.listDetalle({
      ...query,
      desde: desde ?? undefined,
      // `hasta` es inclusivo para el usuario: se consulta hasta el día siguiente a las 00:00
      hasta: hasta ? addDays(hasta, 1) : undefined,
      empleadoId: query.empleado_id,
      clienteId: query.cliente_id,
    });
    return { items, meta: buildMeta(query, total) };
  },

  obtener: detalleOrFail,

  async crear(dto: CrearCitaDto, usuarioId: number | null): Promise<CitaDetalle> {
    const inicio = parseInicio(dto.fecha_inicio);
    const ahora = new Date();

    const citaId = await withTransaction(async (conn) => {
      await bloquearEmpleadoActivo(dto.empleado_id, conn);

      const cliente = await ClienteModel.findById(dto.cliente_id, conn);
      if (!cliente?.activo) throw AppError.badRequest('El cliente no existe o está dado de baja', 'INVALID_CLIENT');

      const { servicios, duracion } = await resolverServicios(dto.servicios, conn);
      const fin = addMinutes(inicio, duracion);
      await validarAgenda(conn, { empleadoId: dto.empleado_id, inicio, fin, excluirCitaId: null, ahora });

      const id = await CitaModel.insert(
        {
          cliente_id: dto.cliente_id,
          empleado_id: dto.empleado_id,
          fecha_inicio: inicio,
          fecha_fin: fin,
          notas: dto.notas ?? null,
          creado_por: usuarioId,
          created_at: ahora,
        },
        conn,
      );
      await CitaModel.replaceServicios(id, servicios, conn);
      // Outbox: el aviso se guarda en la misma transacción que la cita
      await encolarAvisoCita(conn, id, 'confirmacion_cita', `confirmacion:${id}`);
      return id;
    });

    metricas.citasCreadas.inc();
    OutboxWorker.despertar();
    return detalleOrFail(citaId);
  },

  /**
   * Reprograma (fecha/empleado), cambia servicios o edita notas.
   * Si cambia el horario, la cita vuelve a 'pendiente' y se reenvía la
   * confirmación por WhatsApp (el cliente debe reconfirmar).
   */
  async actualizar(id: number, dto: ActualizarCitaDto): Promise<CitaDetalle> {
    const ahora = new Date();

    const reprogramada = await withTransaction(async (conn) => {
      const cita = await bloquearCita(id, conn);
      if (cita.version !== dto.version) {
        throw AppError.conflict('La cita ha sido modificada por otra persona. Recarga e inténtalo de nuevo.', 'VERSION_CONFLICT');
      }
      if (!(ESTADOS_ACTIVOS as readonly EstadoCita[]).includes(cita.estado)) {
        throw AppError.conflict(`Una cita "${cita.estado}" no se puede modificar`, 'INVALID_STATE');
      }

      const empleadoId = dto.empleado_id ?? cita.empleado_id;
      const inicio = dto.fecha_inicio ? parseInicio(dto.fecha_inicio) : cita.fecha_inicio;
      const cambiaHorario = empleadoId !== cita.empleado_id || inicio.getTime() !== cita.fecha_inicio.getTime();

      const cambios: CitaUpdate = {};
      if (dto.notas !== undefined) cambios.notas = dto.notas;

      if (cambiaHorario || dto.servicios) {
        await bloquearEmpleados([cita.empleado_id, empleadoId], conn);
        const resueltos = dto.servicios ? await resolverServicios(dto.servicios, conn) : null;
        const duracion = resueltos?.duracion ?? (cita.fecha_fin.getTime() - cita.fecha_inicio.getTime()) / 60_000;
        const fin = addMinutes(inicio, duracion);

        await validarAgenda(conn, { empleadoId, inicio, fin, excluirCitaId: id, ahora });
        cambios.empleado_id = empleadoId;
        cambios.fecha_inicio = inicio;
        cambios.fecha_fin = fin;

        if (cambiaHorario) {
          cambios.estado = 'pendiente';
          cambios.confirmada_via = null;
          cambios.confirmada_en = null;
          cambios.recordatorio_enviado = false;
        }
        if (resueltos) await CitaModel.replaceServicios(id, resueltos.servicios, conn);
      }

      await guardar(cita, cambios, conn);
      if (cambiaHorario) await encolarAvisoCita(conn, id, 'cambio_cita', `cambio:${id}:${cita.version + 1}`);
      return cambiaHorario;
    });

    if (reprogramada) OutboxWorker.despertar();
    return detalleOrFail(id);
  },

  /** Transiciones confirmada / completada / no_asistio (idempotente) */
  async cambiarEstado(id: number, estado: EstadoManual, origen: OrigenCambio = 'manual'): Promise<CitaDetalle> {
    const ahora = new Date();
    await withTransaction(async (conn) => cambiarEstadoEnTransaccion(conn, await bloquearCita(id, conn), estado, origen, ahora));
    return detalleOrFail(id);
  },

  /**
   * Completa la cita y registra las notas técnicas de cada servicio (fórmula
   * del tinte, técnica, productos usados...) en una sola operación atómica.
   */
  async completar(id: number, dto: CompletarCitaDto): Promise<CitaDetalle> {
    const ahora = new Date();
    await withTransaction(async (conn) => {
      const cita = await bloquearCita(id, conn);
      await cambiarEstadoEnTransaccion(conn, cita, 'completada', 'manual', ahora);
      await CitaModel.updateNotasTecnicas(id, dto.notas_tecnicas, conn);
    });
    return detalleOrFail(id);
  },

  /** Corrige las notas técnicas de una cita ya completada */
  async actualizarNotasTecnicas(id: number, dto: NotasTecnicasDto): Promise<CitaDetalle> {
    await withTransaction(async (conn) => {
      const cita = await bloquearCita(id, conn);
      if (cita.estado !== 'completada') {
        throw AppError.conflict('Las notas técnicas se registran en citas completadas', 'INVALID_STATE');
      }
      await CitaModel.updateNotasTecnicas(id, dto.notas_tecnicas, conn);
    });
    return detalleOrFail(id);
  },

  async cancelar(id: number, motivo: string | null, origen: OrigenCambio = 'manual'): Promise<CitaDetalle> {
    const ahora = new Date();
    const cancelada = await withTransaction(async (conn) =>
      cancelarEnTransaccion(conn, await bloquearCita(id, conn), motivo, origen, ahora),
    );
    if (cancelada) OutboxWorker.despertar();
    return detalleOrFail(id);
  },

  /** Huecos libres de un empleado un día concreto (horario, bloqueos y citas). Solo lectura. */
  async disponibilidad(query: DisponibilidadQuery): Promise<{ fecha: string; huecos: string[] }> {
    const dia = parseLocalDate(query.fecha);
    if (!dia) throw AppError.badRequest('Fecha no válida', 'INVALID_DATE');

    const empleado = await EmpleadoModel.findById(query.empleado_id);
    if (!empleado?.activo) throw AppError.notFound('Empleado');

    const finDia = addDays(dia, 1);
    const [horarios, citas, bloqueos] = await Promise.all([
      EmpleadoModel.getHorarios(query.empleado_id),
      CitaModel.findOcupadas(query.empleado_id, dia, finDia, query.excluir_cita_id ?? null),
      BloqueoModel.list({ desde: dia, hasta: finDia, empleadoId: query.empleado_id }),
    ]);

    const huecos = calcularHuecos({
      dia,
      duracionMinutos: query.duracion,
      ventanas: ventanasLaborables(dia.getDay(), horarios, NEGOCIO),
      // Un bloqueo ocupa la agenda igual que una cita
      ocupadas: [...citas, ...bloqueos],
      intervaloMinutos: env.SLOT_INTERVAL_MINUTES,
      ahora: new Date(),
    });
    return { fecha: query.fecha, huecos };
  },
} as const;
