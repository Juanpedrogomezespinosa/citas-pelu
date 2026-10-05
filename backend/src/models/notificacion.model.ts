/**
 * Modelo Notificacion: registro de mensajes de WhatsApp (salientes y entrantes)
 * y cola de salida (patrón outbox).
 *
 * Ciclo de vida saliente:
 *   pendiente --(worker envía)--> enviado -> entregado -> leido
 *       \--(error, reintentos)--> pendiente (proximo_intento_en futuro) ... -> fallido
 */
import { placeholders, pool, run, select, selectOne, type Db, type SqlParam } from '../config/database.js';
import { toOffset, type PageQuery } from '../utils/pagination.js';

export const TIPOS_NOTIFICACION = [
  'confirmacion_cita',
  'recordatorio',
  'cambio_cita',
  'cancelacion',
  'respuesta_automatica',
  'mensaje_entrante',
] as const;
export const ESTADOS_NOTIFICACION = ['pendiente', 'enviado', 'entregado', 'leido', 'fallido', 'recibido'] as const;
export const PROVEEDORES = ['console', 'twilio', 'meta'] as const;
/** Plantillas aprobadas: una por cada tipo de mensaje que inicia el negocio */
export const CLAVES_PLANTILLA = ['confirmacion', 'recordatorio', 'cambio', 'cancelacion'] as const;

export type TipoNotificacion = (typeof TIPOS_NOTIFICACION)[number];
export type EstadoNotificacion = (typeof ESTADOS_NOTIFICACION)[number];
export type Proveedor = (typeof PROVEEDORES)[number];
export type ClavePlantilla = (typeof CLAVES_PLANTILLA)[number];
export type RespuestaInterpretada = 'confirmar' | 'cancelar' | 'desconocida';

/** Estados de entrega que reporta el proveedor vía webhook */
export type EstadoEntrega = Extract<EstadoNotificacion, 'enviado' | 'entregado' | 'leido' | 'fallido'>;

/**
 * Orden del ciclo de vida. Los webhooks pueden llegar desordenados (un
 * 'delivered' después de un 'read'): nunca retrocedemos de estado.
 */
const RANGO_ESTADO: Readonly<Record<EstadoNotificacion, number>> = Object.freeze({
  pendiente: 0,
  enviado: 1,
  entregado: 2,
  leido: 3,
  fallido: 1, // un fallo puede llegar tras 'enviado', pero no anula un 'leido'
  recibido: 0,
});

export const puedeAvanzar = (actual: EstadoNotificacion, nuevo: EstadoNotificacion): boolean =>
  nuevo !== actual && RANGO_ESTADO[nuevo] >= RANGO_ESTADO[actual] && actual !== 'leido';

export interface Notificacion {
  id: number;
  cita_id: number | null;
  cliente_id: number | null;
  tipo: TipoNotificacion;
  direccion: 'saliente' | 'entrante';
  canal: 'whatsapp';
  proveedor: Proveedor;
  telefono: string;
  mensaje: string;
  plantilla_clave: ClavePlantilla | null;
  plantilla_parametros: string[] | null;
  estado: EstadoNotificacion;
  proveedor_message_id: string | null;
  clave_idempotencia: string | null;
  respuesta_interpretada: RespuestaInterpretada | null;
  error: string | null;
  intentos: number;
  proximo_intento_en: Date | null;
  enviado_en: Date | null;
  entregado_en: Date | null;
  leido_en: Date | null;
  created_at: Date;
}

export interface NuevaNotificacion {
  tipo: TipoNotificacion;
  direccion: 'saliente' | 'entrante';
  proveedor: Proveedor;
  telefono: string;
  mensaje: string;
  estado: 'pendiente' | 'recibido';
  cita_id?: number | null;
  cliente_id?: number | null;
  plantilla?: { clave: ClavePlantilla; parametros: readonly string[] } | null;
  proveedor_message_id?: string | null;
  clave_idempotencia?: string | null;
  respuesta_interpretada?: RespuestaInterpretada | null;
  /** Para salientes: cuándo puede enviarlo el worker (por defecto, ya) */
  proximo_intento_en?: Date | null;
}

const COLUMNS = `id, cita_id, cliente_id, tipo, direccion, canal, proveedor, telefono, mensaje,
  plantilla_clave, plantilla_parametros, estado, proveedor_message_id, clave_idempotencia,
  respuesta_interpretada, error, intentos, proximo_intento_en, enviado_en, entregado_en, leido_en, created_at`;

export const NotificacionModel = {
  /**
   * Inserta un mensaje (saliente en cola o entrante recibido).
   * Lanza ER_DUP_ENTRY si la clave de idempotencia ya existe: el llamador lo trata como "ya hecho".
   */
  async insert(n: NuevaNotificacion, db: Db = pool): Promise<number> {
    const result = await run(
      db,
      `INSERT INTO notificaciones
         (cita_id, cliente_id, tipo, direccion, proveedor, telefono, mensaje, plantilla_clave, plantilla_parametros,
          estado, proveedor_message_id, clave_idempotencia, respuesta_interpretada, proximo_intento_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        n.cita_id ?? null,
        n.cliente_id ?? null,
        n.tipo,
        n.direccion,
        n.proveedor,
        n.telefono,
        n.mensaje,
        n.plantilla?.clave ?? null,
        n.plantilla ? JSON.stringify(n.plantilla.parametros) : null,
        n.estado,
        n.proveedor_message_id ?? null,
        n.clave_idempotencia ?? null,
        n.respuesta_interpretada ?? null,
        n.proximo_intento_en ?? null,
      ],
    );
    return result.insertId;
  },

  findById(id: number, db: Db = pool): Promise<Notificacion | null> {
    return selectOne<Notificacion>(db, `SELECT ${COLUMNS} FROM notificaciones WHERE id = ?`, [id]);
  },

  findByProveedorId(proveedorMessageId: string, db: Db = pool): Promise<Notificacion | null> {
    return selectOne<Notificacion>(db, `SELECT ${COLUMNS} FROM notificaciones WHERE proveedor_message_id = ?`, [proveedorMessageId]);
  },

  // ---------------------------------------------------------------- outbox

  /**
   * Reclama un lote de mensajes listos para enviar. FOR UPDATE SKIP LOCKED:
   * varias instancias del worker pueden trabajar a la vez sin coger el mismo
   * mensaje. Llamar dentro de una transacción, seguido de `alquilar`.
   */
  reclamarPendientes(ahora: Date, limite: number, db: Db): Promise<Notificacion[]> {
    // DATETIME no guarda milisegundos y MySQL REDONDEA al insertar (10:00:00.7 -> 10:00:01):
    // se compara con el segundo siguiente para no dejar fuera lo encolado "ahora mismo".
    const corte = new Date(Math.ceil(ahora.getTime() / 1000) * 1000);
    return select<Notificacion>(
      db,
      `SELECT ${COLUMNS} FROM notificaciones
        WHERE direccion = 'saliente' AND estado = 'pendiente' AND proximo_intento_en <= ?
        ORDER BY proximo_intento_en, id
        LIMIT ?
        FOR UPDATE SKIP LOCKED`,
      [corte, String(limite)],
    );
  },

  /**
   * "Alquila" los mensajes reclamados hasta `hasta`: si el proceso muere a
   * mitad del envío, otro worker los recogerá al vencer el alquiler.
   */
  async alquilar(ids: readonly number[], hasta: Date, db: Db): Promise<void> {
    if (ids.length === 0) return;
    await run(db, `UPDATE notificaciones SET proximo_intento_en = ? WHERE id IN (${placeholders(ids.length)})`, [hasta, ...ids]);
  },

  async markEnviada(id: number, proveedorMessageId: string, at: Date, db: Db = pool): Promise<void> {
    await run(
      db,
      `UPDATE notificaciones
          SET estado = 'enviado', proveedor_message_id = ?, enviado_en = ?, error = NULL,
              intentos = intentos + 1, proximo_intento_en = NULL
        WHERE id = ?`,
      [proveedorMessageId, at, id],
    );
  },

  async markReintento(id: number, error: string, proximoIntento: Date, db: Db = pool): Promise<void> {
    await run(db, 'UPDATE notificaciones SET error = ?, intentos = intentos + 1, proximo_intento_en = ? WHERE id = ?', [
      error.slice(0, 500),
      proximoIntento,
      id,
    ]);
  },

  async markFallida(id: number, error: string, db: Db = pool): Promise<void> {
    await run(
      db,
      `UPDATE notificaciones SET estado = 'fallido', error = ?, intentos = intentos + 1, proximo_intento_en = NULL WHERE id = ?`,
      [error.slice(0, 500), id],
    );
  },

  /** Reintento manual de un fallido: vuelve a la cola */
  async reencolar(id: number, ahora: Date, db: Db = pool): Promise<boolean> {
    const result = await run(
      db,
      `UPDATE notificaciones SET estado = 'pendiente', proximo_intento_en = ?
        WHERE id = ? AND direccion = 'saliente' AND estado = 'fallido'`,
      [ahora, id],
    );
    return result.affectedRows === 1;
  },

  /** Métricas: tamaño de la cola y antigüedad del mensaje más viejo (segundos) */
  async estadoCola(ahora: Date, db: Db = pool): Promise<{ pendientes: number; antiguedad_max_s: number; fallidas_24h: number }> {
    const row = await selectOne<{ pendientes: number; mas_antiguo: Date | null; fallidas_24h: number }>(
      db,
      `SELECT
         SUM(estado = 'pendiente' AND direccion = 'saliente') AS pendientes,
         MIN(CASE WHEN estado = 'pendiente' AND direccion = 'saliente' THEN created_at END) AS mas_antiguo,
         SUM(estado = 'fallido' AND updated_at >= ? - INTERVAL 1 DAY) AS fallidas_24h
       FROM notificaciones
       WHERE estado IN ('pendiente', 'fallido')`,
      [ahora],
    );
    return {
      pendientes: Number(row?.pendientes ?? 0),
      antiguedad_max_s: row?.mas_antiguo ? Math.max(0, Math.round((ahora.getTime() - row.mas_antiguo.getTime()) / 1000)) : 0,
      fallidas_24h: Number(row?.fallidas_24h ?? 0),
    };
  },

  // ----------------------------------------------------- estados de entrega

  async updateEstadoEntrega(id: number, estado: EstadoEntrega, at: Date, error: string | null, db: Db = pool): Promise<void> {
    const columnaFecha = { enviado: 'enviado_en', entregado: 'entregado_en', leido: 'leido_en', fallido: null }[estado];
    const sets = ['estado = ?'];
    const params: SqlParam[] = [estado];
    if (columnaFecha) {
      sets.push(`${columnaFecha} = COALESCE(${columnaFecha}, ?)`);
      params.push(at);
    }
    if (error) {
      sets.push('error = ?');
      params.push(error.slice(0, 500));
    }
    await run(db, `UPDATE notificaciones SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
  },

  // ------------------------------------------------------------------- RGPD

  /** Borra teléfono y contenido de los mensajes de un cliente anonimizado */
  async anonimizarDeCliente(clienteId: number, db: Db): Promise<void> {
    await run(db, `UPDATE notificaciones SET telefono = '', mensaje = '[anonimizado]', plantilla_parametros = NULL WHERE cliente_id = ?`, [
      clienteId,
    ]);
  },

  listDeCliente(clienteId: number, db: Db = pool): Promise<Notificacion[]> {
    return select<Notificacion>(db, `SELECT ${COLUMNS} FROM notificaciones WHERE cliente_id = ? ORDER BY id`, [clienteId]);
  },

  // ---------------------------------------------------------------- listado

  async list(
    f: {
      citaId?: number | undefined;
      clienteId?: number | undefined;
      estado?: EstadoNotificacion | undefined;
      tipo?: TipoNotificacion | undefined;
    } & PageQuery,
    db: Db = pool,
  ): Promise<{ items: Notificacion[]; total: number }> {
    const where: string[] = [];
    const params: SqlParam[] = [];
    if (f.citaId) {
      where.push('cita_id = ?');
      params.push(f.citaId);
    }
    if (f.clienteId) {
      where.push('cliente_id = ?');
      params.push(f.clienteId);
    }
    if (f.estado) {
      where.push('estado = ?');
      params.push(f.estado);
    }
    if (f.tipo) {
      where.push('tipo = ?');
      params.push(f.tipo);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { limit, offset } = toOffset(f);

    const items = await select<Notificacion>(
      db,
      `SELECT ${COLUMNS} FROM notificaciones ${whereSql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      [...params, String(limit), String(offset)],
    );
    const totalRow = await selectOne<{ total: number }>(db, `SELECT COUNT(*) AS total FROM notificaciones ${whereSql}`, params);
    return { items, total: totalRow?.total ?? 0 };
  },
} as const;
