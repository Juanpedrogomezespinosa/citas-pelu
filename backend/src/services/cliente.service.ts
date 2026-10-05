import { withTransaction } from '../config/database.js';
import type { ActualizarClienteDto, CrearClienteDto, ListarClientesQuery } from '../dtos/cliente.dto.js';
import { CitaModel, type Cita, type CitaDetalle } from '../models/cita.model.js';
import { ClienteModel, type Cliente, type EstadisticasCliente, type HistorialFila } from '../models/cliente.model.js';
import { CobroModel, type Cobro } from '../models/cobro.model.js';
import { NotificacionModel, type Notificacion } from '../models/notificacion.model.js';
import { AppError } from '../utils/app-error.js';
import { buildMeta, type Paginated } from '../utils/pagination.js';
import { cancelarEnTransaccion } from './cita.service.js';
import { OutboxWorker } from './outbox.service.js';

export interface VisitaHistorial {
  cita_id: number;
  fecha_inicio: Date;
  estado: string;
  empleado_nombre: string;
  notas_cita: string | null;
  total: number;
  servicios: Pick<HistorialFila, 'servicio_id' | 'servicio_nombre' | 'categoria' | 'precio' | 'notas_tecnicas'>[];
}

export interface HistorialCliente {
  estadisticas: EstadisticasCliente & { servicio_favorito: string | null };
  visitas: VisitaHistorial[];
}

export interface ExportacionCliente {
  exportado_en: Date;
  cliente: Cliente;
  citas: CitaDetalle[];
  cobros: Cobro[];
  mensajes_whatsapp: Pick<Notificacion, 'tipo' | 'direccion' | 'mensaje' | 'estado' | 'created_at'>[];
}

/** Error 409 con las citas que impiden la operación, para que la UI las muestre */
function conflictoCitasFuturas(citas: readonly Cita[], quien: string): AppError {
  return new AppError(
    `${quien} tiene ${citas.length} cita(s) pendientes. Cancélalas o reprográmalas antes de continuar.`,
    409,
    'HAS_FUTURE_APPOINTMENTS',
    { citas: citas.map((c) => ({ id: c.id, fecha_inicio: c.fecha_inicio, estado: c.estado })) },
  );
}

export const ClienteService = {
  async listar(query: ListarClientesQuery): Promise<Paginated<Cliente>> {
    const { items, total } = await ClienteModel.list({ ...query, incluirInactivos: query.incluir_inactivos });
    return { items, meta: buildMeta(query, total) };
  },

  async obtener(id: number): Promise<Cliente> {
    const cliente = await ClienteModel.findById(id);
    if (!cliente) throw AppError.notFound('Cliente');
    return cliente;
  },

  async crear(dto: CrearClienteDto): Promise<Cliente> {
    const id = await ClienteModel.create(dto); // teléfono duplicado -> 409 (UNIQUE en BD)
    return this.obtener(id);
  },

  async actualizar(id: number, dto: ActualizarClienteDto): Promise<Cliente> {
    const cliente = await this.obtener(id);
    if (cliente.anonimizado_en) throw AppError.conflict('Un cliente anonimizado no se puede editar', 'ANONYMIZED');
    await ClienteModel.update(id, dto);
    return this.obtener(id);
  },

  /**
   * Baja lógica. Si tiene citas futuras activas:
   *  - por defecto se rechaza (409 con la lista) para que nadie pierda una cita sin saberlo;
   *  - con `cancelarCitas` se cancelan (avisando por WhatsApp) en la MISMA transacción.
   */
  async desactivar(id: number, { cancelarCitas }: { cancelarCitas: boolean }): Promise<void> {
    const ahora = new Date();
    const huboCancelaciones = await withTransaction(async (conn) => {
      if (!(await ClienteModel.lockById(id, conn))) throw AppError.notFound('Cliente');
      const futuras = await CitaModel.findActivasFuturas({ clienteId: id }, ahora, conn);
      if (futuras.length && !cancelarCitas) throw conflictoCitasFuturas(futuras, 'El cliente');
      for (const cita of futuras) await cancelarEnTransaccion(conn, cita, 'Baja del cliente', 'manual', ahora);
      await ClienteModel.setActivo(id, false, conn);
      return futuras.length > 0;
    });
    if (huboCancelaciones) OutboxWorker.despertar();
  },

  async reactivar(id: number): Promise<Cliente> {
    const cliente = await this.obtener(id);
    if (cliente.anonimizado_en) throw AppError.conflict('Un cliente anonimizado no se puede reactivar', 'ANONYMIZED');
    await ClienteModel.setActivo(id, true);
    return this.obtener(id);
  },

  /** RGPD (derecho de acceso y portabilidad): todos los datos del cliente en JSON */
  async exportar(id: number): Promise<ExportacionCliente> {
    const cliente = await this.obtener(id);
    const [citas, cobros, mensajes] = await Promise.all([
      CitaModel.listDetalle({ clienteId: id, orden: 'asc', page: 1, limit: 10_000 }),
      CobroModel.listDeCliente(id),
      NotificacionModel.listDeCliente(id),
    ]);
    return {
      exportado_en: new Date(),
      cliente,
      citas: citas.items,
      cobros,
      mensajes_whatsapp: mensajes.map(({ tipo, direccion, mensaje, estado, created_at }) => ({
        tipo,
        direccion,
        mensaje,
        estado,
        created_at,
      })),
    };
  },

  /**
   * RGPD (derecho de supresión): anonimiza al cliente de forma IRREVERSIBLE.
   * Se conservan citas y cobros (obligación contable) sin datos personales.
   * No se permite con citas futuras activas: primero hay que cancelarlas.
   */
  async anonimizar(id: number): Promise<Cliente> {
    const ahora = new Date();
    await withTransaction(async (conn) => {
      const cliente = await ClienteModel.lockById(id, conn);
      if (!cliente) throw AppError.notFound('Cliente');
      if (cliente.anonimizado_en) return; // idempotente
      const futuras = await CitaModel.findActivasFuturas({ clienteId: id }, ahora, conn);
      if (futuras.length) throw conflictoCitasFuturas(futuras, 'El cliente');

      await ClienteModel.anonimizar(id, ahora, conn);
      await CitaModel.anonimizarDeCliente(id, conn);
      await NotificacionModel.anonimizarDeCliente(id, conn);
    });
    return this.obtener(id);
  },

  async historial(id: number): Promise<HistorialCliente> {
    await this.obtener(id);
    const [filas, estadisticas] = await Promise.all([ClienteModel.historial(id), ClienteModel.estadisticas(id, new Date())]);

    // Agrupa las filas (una por servicio) en visitas (una por cita)
    const visitas = new Map<number, VisitaHistorial>();
    for (const f of filas) {
      const visita = visitas.get(f.cita_id) ?? {
        cita_id: f.cita_id,
        fecha_inicio: f.fecha_inicio,
        estado: f.estado,
        empleado_nombre: f.empleado_nombre,
        notas_cita: f.notas_cita,
        total: 0,
        servicios: [],
      };
      visita.servicios.push({
        servicio_id: f.servicio_id,
        servicio_nombre: f.servicio_nombre,
        categoria: f.categoria,
        precio: f.precio,
        notas_tecnicas: f.notas_tecnicas,
      });
      visita.total += f.precio;
      visitas.set(f.cita_id, visita);
    }

    return {
      estadisticas: { ...estadisticas, servicio_favorito: servicioMasFrecuente(filas) },
      visitas: [...visitas.values()],
    };
  },
} as const;

function servicioMasFrecuente(filas: readonly HistorialFila[]): string | null {
  const conteo = new Map<string, number>();
  for (const f of filas) {
    if (f.estado === 'completada') conteo.set(f.servicio_nombre, (conteo.get(f.servicio_nombre) ?? 0) + 1);
  }
  let favorito: string | null = null;
  let max = 0;
  for (const [nombre, veces] of conteo) {
    if (veces > max) [favorito, max] = [nombre, veces];
  }
  return favorito;
}
