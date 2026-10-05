/**
 * Modelo Cita: tipado, invariantes de estado y SQL de `citas` y `cita_servicios`.
 */
import { buildSet, placeholders, pool, run, select, selectOne, type Db, type SqlParam } from '../config/database.js';
import { likePattern, toOffset, type PageQuery } from '../utils/pagination.js';

export const ESTADOS_CITA = ['pendiente', 'confirmada', 'completada', 'cancelada', 'no_asistio'] as const;
export type EstadoCita = (typeof ESTADOS_CITA)[number];

/** Estados que ocupan hueco en la agenda */
export const ESTADOS_OCUPAN = ['pendiente', 'confirmada', 'completada'] as const;
/** Estados en los que la cita aún puede modificarse, confirmarse o cancelarse */
export const ESTADOS_ACTIVOS = ['pendiente', 'confirmada'] as const;

/**
 * Máquina de estados de una cita (invariante de dominio).
 * completada / cancelada / no_asistio son estados finales.
 */
export const TRANSICIONES: Readonly<Record<EstadoCita, readonly EstadoCita[]>> = Object.freeze({
  pendiente: ['confirmada', 'completada', 'cancelada', 'no_asistio'],
  confirmada: ['completada', 'cancelada', 'no_asistio'],
  completada: [],
  cancelada: [],
  no_asistio: [],
});

export interface Cita {
  id: number;
  cliente_id: number;
  empleado_id: number;
  fecha_inicio: Date;
  fecha_fin: Date;
  estado: EstadoCita;
  notas: string | null;
  motivo_cancelacion: string | null;
  confirmada_via: 'manual' | 'whatsapp' | null;
  confirmada_en: Date | null;
  cancelada_en: Date | null;
  completada_en: Date | null;
  recordatorio_enviado: boolean;
  version: number;
  creado_por: number | null;
  created_at: Date;
}

export interface CitaServicio {
  servicio_id: number;
  nombre: string;
  categoria: string;
  precio: number;
  duracion_minutos: number;
  notas_tecnicas: string | null;
}

export interface CitaDetalle extends Cita {
  cliente_nombre: string;
  /** null si el cliente fue anonimizado (RGPD) */
  cliente_telefono: string | null;
  cliente_acepta_whatsapp: boolean;
  empleado_nombre: string;
  empleado_color: string;
  /** Derivado: SUM(cita_servicios.precio) — no se almacena (3FN) */
  precio_total: number;
  /** Tiene un cobro vigente en caja */
  cobrada: boolean;
  servicios: CitaServicio[];
}

export type CitaUpdate = Partial<
  Pick<
    Cita,
    | 'empleado_id'
    | 'fecha_inicio'
    | 'fecha_fin'
    | 'estado'
    | 'notas'
    | 'motivo_cancelacion'
    | 'confirmada_via'
    | 'confirmada_en'
    | 'cancelada_en'
    | 'completada_en'
    | 'recordatorio_enviado'
  >
>;

const UPDATABLE = [
  'empleado_id',
  'fecha_inicio',
  'fecha_fin',
  'estado',
  'notas',
  'motivo_cancelacion',
  'confirmada_via',
  'confirmada_en',
  'cancelada_en',
  'completada_en',
  'recordatorio_enviado',
] as const satisfies readonly (keyof CitaUpdate)[];

const CITA_COLUMNS = `c.id, c.cliente_id, c.empleado_id, c.fecha_inicio, c.fecha_fin, c.estado, c.notas,
  c.motivo_cancelacion, c.confirmada_via, c.confirmada_en, c.cancelada_en, c.completada_en,
  c.recordatorio_enviado, c.version, c.creado_por, c.created_at`;

const DETALLE_SELECT = `
  SELECT ${CITA_COLUMNS},
         CONCAT_WS(' ', cl.nombre, cl.apellidos) AS cliente_nombre,
         cl.telefono                            AS cliente_telefono,
         cl.acepta_whatsapp                     AS cliente_acepta_whatsapp,
         CONCAT_WS(' ', e.nombre, e.apellidos)  AS empleado_nombre,
         e.color_calendario                     AS empleado_color,
         (SELECT COALESCE(SUM(cs.precio), 0) FROM cita_servicios cs WHERE cs.cita_id = c.id) AS precio_total,
         EXISTS (SELECT 1 FROM cobros co WHERE co.cita_cobrada = c.id)          AS cobrada
    FROM citas c
    JOIN clientes cl ON cl.id = c.cliente_id
    JOIN empleados e ON e.id = c.empleado_id`;

export interface ListarCitasFiltros extends PageQuery {
  desde?: Date | undefined;
  hasta?: Date | undefined;
  estado?: EstadoCita | undefined;
  empleadoId?: number | undefined;
  clienteId?: number | undefined;
  q?: string | undefined;
  orden: 'asc' | 'desc';
}

/** Adjunta los servicios a cada cita con UNA sola consulta (evita N+1) */
async function attachServicios(citas: Omit<CitaDetalle, 'servicios'>[], db: Db): Promise<CitaDetalle[]> {
  if (citas.length === 0) return [];
  const ids = citas.map((c) => c.id);
  const rows = await select<CitaServicio & { cita_id: number }>(
    db,
    `SELECT cs.cita_id, cs.servicio_id, s.nombre, s.categoria, cs.precio, cs.duracion_minutos, cs.notas_tecnicas
       FROM cita_servicios cs JOIN servicios s ON s.id = cs.servicio_id
      WHERE cs.cita_id IN (${placeholders(ids.length)})
      ORDER BY s.nombre`,
    ids,
  );
  const porCita = Map.groupBy(rows, (r) => r.cita_id);
  return citas.map((c) => ({
    ...c,
    cobrada: Boolean(c.cobrada), // EXISTS devuelve 0/1
    servicios: (porCita.get(c.id) ?? []).map(({ cita_id: _citaId, ...servicio }) => servicio),
  }));
}

export const CitaModel = {
  async findDetalle(id: number, db: Db = pool): Promise<CitaDetalle | null> {
    const cita = await selectOne<Omit<CitaDetalle, 'servicios'>>(db, `${DETALLE_SELECT} WHERE c.id = ?`, [id]);
    if (!cita) return null;
    const [detalle] = await attachServicios([cita], db);
    return detalle ?? null;
  },

  async listDetalle(f: ListarCitasFiltros, db: Db = pool): Promise<{ items: CitaDetalle[]; total: number }> {
    const where: string[] = [];
    const params: SqlParam[] = [];

    if (f.desde) {
      where.push('c.fecha_inicio >= ?');
      params.push(f.desde);
    }
    if (f.hasta) {
      where.push('c.fecha_inicio < ?');
      params.push(f.hasta);
    }
    if (f.estado) {
      where.push('c.estado = ?');
      params.push(f.estado);
    }
    if (f.empleadoId) {
      where.push('c.empleado_id = ?');
      params.push(f.empleadoId);
    }
    if (f.clienteId) {
      where.push('c.cliente_id = ?');
      params.push(f.clienteId);
    }
    if (f.q) {
      const pattern = likePattern(f.q);
      where.push('(cl.nombre LIKE ? OR cl.apellidos LIKE ? OR cl.telefono LIKE ?)');
      params.push(pattern, pattern, pattern);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    // `orden` viene de un enum validado ('asc' | 'desc'): seguro de interpolar
    const order = f.orden === 'desc' ? 'DESC' : 'ASC';
    const { limit, offset } = toOffset(f);

    const rows = await select<Omit<CitaDetalle, 'servicios'>>(
      db,
      `${DETALLE_SELECT} ${whereSql} ORDER BY c.fecha_inicio ${order}, c.id ${order} LIMIT ? OFFSET ?`,
      [...params, String(limit), String(offset)],
    );
    const totalRow = await selectOne<{ total: number }>(
      db,
      `SELECT COUNT(*) AS total FROM citas c JOIN clientes cl ON cl.id = c.cliente_id ${whereSql}`,
      params,
    );
    return { items: await attachServicios(rows, db), total: totalRow?.total ?? 0 };
  },

  /** Bloquea la cita (SELECT ... FOR UPDATE) hasta el fin de la transacción */
  lockById(id: number, db: Db): Promise<Cita | null> {
    return selectOne<Cita>(db, `SELECT ${CITA_COLUMNS} FROM citas c WHERE c.id = ? FOR UPDATE`, [id]);
  },

  /** Primera cita del empleado que se solape con [inicio, fin), o null */
  findSolape(empleadoId: number, inicio: Date, fin: Date, excluirId: number | null, db: Db): Promise<{ id: number } | null> {
    return selectOne<{ id: number }>(
      db,
      `SELECT id FROM citas
        WHERE empleado_id = ?
          AND estado IN (${placeholders(ESTADOS_OCUPAN.length)})
          AND fecha_inicio < ? AND fecha_fin > ?
          AND id <> ?
        LIMIT 1`,
      [empleadoId, ...ESTADOS_OCUPAN, fin, inicio, excluirId ?? 0],
    );
  },

  /** Intervalos ocupados del empleado en [desde, hasta) — para calcular huecos libres */
  findOcupadas(empleadoId: number, desde: Date, hasta: Date, excluirId: number | null, db: Db = pool) {
    return select<{ fecha_inicio: Date; fecha_fin: Date }>(
      db,
      `SELECT fecha_inicio, fecha_fin FROM citas
        WHERE empleado_id = ?
          AND estado IN (${placeholders(ESTADOS_OCUPAN.length)})
          AND fecha_inicio < ? AND fecha_fin > ?
          AND id <> ?
        ORDER BY fecha_inicio`,
      [empleadoId, ...ESTADOS_OCUPAN, hasta, desde, excluirId ?? 0],
    );
  },

  async insert(
    data: Pick<Cita, 'cliente_id' | 'empleado_id' | 'fecha_inicio' | 'fecha_fin' | 'notas' | 'creado_por' | 'created_at'>,
    db: Db,
  ): Promise<number> {
    const result = await run(
      db,
      `INSERT INTO citas (cliente_id, empleado_id, fecha_inicio, fecha_fin, notas, creado_por, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.cliente_id, data.empleado_id, data.fecha_inicio, data.fecha_fin, data.notas, data.creado_por, data.created_at],
    );
    return result.insertId;
  },

  async replaceServicios(
    citaId: number,
    servicios: readonly { id: number; precio: number; duracion_minutos: number }[],
    db: Db,
  ): Promise<void> {
    await run(db, 'DELETE FROM cita_servicios WHERE cita_id = ?', [citaId]);
    for (const s of servicios) {
      await run(db, 'INSERT INTO cita_servicios (cita_id, servicio_id, precio, duracion_minutos) VALUES (?, ?, ?, ?)', [
        citaId,
        s.id,
        s.precio,
        s.duracion_minutos,
      ]);
    }
  },

  /**
   * UPDATE con bloqueo optimista: solo se aplica si la versión coincide.
   * @returns false si otra persona modificó la cita entre medias
   */
  async update(id: number, expectedVersion: number, data: CitaUpdate, db: Db): Promise<boolean> {
    const { clause, values } = buildSet(data, UPDATABLE);
    const set = clause ? `${clause}, version = version + 1` : 'version = version + 1';
    const result = await run(db, `UPDATE citas SET ${set} WHERE id = ? AND version = ?`, [...values, id, expectedVersion]);
    return result.affectedRows === 1;
  },

  /**
   * Citas activas que empiezan en (ahora, hasta] y aún no tienen recordatorio.
   * Se excluyen las reservadas con menos antelación que la ventana del
   * recordatorio: ya recibieron la confirmación hace poco.
   */
  findParaRecordatorio(ahora: Date, hasta: Date, horasAntelacion: number, limit: number, db: Db = pool): Promise<{ id: number }[]> {
    return select<{ id: number }>(
      db,
      `SELECT id FROM citas
        WHERE recordatorio_enviado = 0
          AND estado IN ('pendiente', 'confirmada')
          AND fecha_inicio > ? AND fecha_inicio <= ?
          AND TIMESTAMPDIFF(MINUTE, created_at, fecha_inicio) >= ?
        ORDER BY fecha_inicio
        LIMIT ?`,
      [ahora, hasta, horasAntelacion * 60, String(limit)],
    );
  },

  /**
   * Cita a la que se refiere una respuesta de WhatsApp del cliente:
   *  1) la cita activa y futura del ÚLTIMO mensaje que le enviamos
   *     (si tiene dos citas y responde al recordatorio de la segunda, es esa);
   *  2) si no hay ninguna, su próxima cita activa.
   */
  async findCitaDeRespuesta(clienteId: number, ahora: Date, db: Db = pool): Promise<{ id: number } | null> {
    const notificada = await selectOne<{ id: number }>(
      db,
      `SELECT c.id FROM notificaciones n
         JOIN citas c ON c.id = n.cita_id
        WHERE n.cliente_id = ? AND n.direccion = 'saliente'
          AND n.tipo IN ('confirmacion_cita', 'recordatorio', 'cambio_cita')
          AND c.estado IN ('pendiente', 'confirmada') AND c.fecha_inicio > ?
        ORDER BY n.id DESC LIMIT 1`,
      [clienteId, ahora],
    );
    if (notificada) return notificada;

    return selectOne<{ id: number }>(
      db,
      `SELECT id FROM citas
        WHERE cliente_id = ? AND estado IN ('pendiente', 'confirmada') AND fecha_inicio > ?
        ORDER BY fecha_inicio LIMIT 1`,
      [clienteId, ahora],
    );
  },

  async markRecordatorioEnviado(id: number, db: Db = pool): Promise<void> {
    // No toca `version`: es un flag técnico, no una edición del usuario
    await run(db, 'UPDATE citas SET recordatorio_enviado = 1 WHERE id = ?', [id]);
  },

  /**
   * Citas activas (pendientes/confirmadas) futuras de un cliente o de un
   * empleado, BLOQUEADAS: para darles de baja sin que entre otra reserva.
   */
  findActivasFuturas(filtro: { clienteId: number } | { empleadoId: number }, ahora: Date, db: Db): Promise<Cita[]> {
    const [columna, valor] = 'clienteId' in filtro ? ['cliente_id', filtro.clienteId] : ['empleado_id', filtro.empleadoId];
    return select<Cita>(
      db,
      `SELECT ${CITA_COLUMNS} FROM citas c
        WHERE c.${columna} = ? AND c.estado IN ('pendiente', 'confirmada') AND c.fecha_inicio > ?
        ORDER BY c.fecha_inicio
        FOR UPDATE`,
      [valor, ahora],
    );
  },

  /** Citas activas que se solapan con [desde, hasta) — de un empleado o de todos (null) */
  findActivasEnRango(empleadoId: number | null, desde: Date, hasta: Date, db: Db = pool) {
    return select<{ id: number; fecha_inicio: Date; cliente_nombre: string; empleado_nombre: string }>(
      db,
      `SELECT c.id, c.fecha_inicio, CONCAT_WS(' ', cl.nombre, cl.apellidos) AS cliente_nombre,
              CONCAT_WS(' ', e.nombre, e.apellidos) AS empleado_nombre
         FROM citas c
         JOIN clientes cl ON cl.id = c.cliente_id
         JOIN empleados e ON e.id = c.empleado_id
        WHERE c.estado IN ('pendiente', 'confirmada')
          AND c.fecha_inicio < ? AND c.fecha_fin > ?
          AND (? IS NULL OR c.empleado_id = ?)
        ORDER BY c.fecha_inicio`,
      [hasta, desde, empleadoId, empleadoId],
    );
  },

  /** Notas técnicas por servicio (fórmula del tinte, técnica...). Solo servicios de ESA cita. */
  async updateNotasTecnicas(citaId: number, notas: readonly { servicio_id: number; notas: string | null }[], db: Db): Promise<void> {
    for (const n of notas) {
      await run(db, 'UPDATE cita_servicios SET notas_tecnicas = ? WHERE cita_id = ? AND servicio_id = ?', [n.notas, citaId, n.servicio_id]);
    }
  },

  /** RGPD: borra el texto libre de las citas de un cliente (puede contener datos personales o de salud) */
  async anonimizarDeCliente(clienteId: number, db: Db): Promise<void> {
    await run(db, 'UPDATE citas SET notas = NULL, motivo_cancelacion = NULL WHERE cliente_id = ?', [clienteId]);
    await run(db, 'UPDATE cita_servicios cs JOIN citas c ON c.id = cs.cita_id SET cs.notas_tecnicas = NULL WHERE c.cliente_id = ?', [
      clienteId,
    ]);
  },

  /** Clientes sin actividad (citas) desde `limite` — candidatos a anonimización automática */
  clientesInactivosDesde(limite: Date, db: Db = pool): Promise<{ id: number }[]> {
    return select<{ id: number }>(
      db,
      `SELECT cl.id FROM clientes cl
        WHERE cl.anonimizado_en IS NULL AND cl.created_at < ?
          AND NOT EXISTS (SELECT 1 FROM citas c WHERE c.cliente_id = cl.id AND c.fecha_inicio >= ?)
        LIMIT 500`,
      [limite, limite],
    );
  },
} as const;
