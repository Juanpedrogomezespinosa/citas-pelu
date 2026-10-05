/**
 * Modelo Cliente: perfil completo con ficha técnica capilar y preferencias.
 * El historial de servicios se deriva de citas (vista v_historial_servicios_cliente).
 */
import { buildSet, pool, run, select, selectOne, type Db, type SqlParam } from '../config/database.js';
import { likePattern, toOffset, type PageQuery } from '../utils/pagination.js';

export const TIPOS_CABELLO = ['liso', 'ondulado', 'rizado', 'afro', 'otro'] as const;
export const SENSIBILIDADES = ['ninguna', 'baja', 'media', 'alta'] as const;

export type TipoCabello = (typeof TIPOS_CABELLO)[number];
export type Sensibilidad = (typeof SENSIBILIDADES)[number];

export interface Cliente {
  id: number;
  nombre: string;
  apellidos: string | null;
  /** E.164. null solo si el cliente fue anonimizado (RGPD) */
  telefono: string | null;
  email: string | null;
  fecha_nacimiento: string | null;
  acepta_whatsapp: boolean;
  tipo_cabello: TipoCabello | null;
  color_preferido: string | null;
  tipo_corte_preferido: string | null;
  sensibilidad_cuero_cabelludo: Sensibilidad;
  alergias: string | null;
  productos_preferidos: string | null;
  notas: string | null;
  activo: boolean;
  anonimizado_en: Date | null;
  created_at: Date;
  updated_at: Date;
}

/** Campos editables (lista blanca para INSERT/UPDATE) */
export type ClienteInput = Partial<Omit<Cliente, 'id' | 'activo' | 'anonimizado_en' | 'created_at' | 'updated_at'>>;

const EDITABLES = [
  'nombre',
  'apellidos',
  'telefono',
  'email',
  'fecha_nacimiento',
  'acepta_whatsapp',
  'tipo_cabello',
  'color_preferido',
  'tipo_corte_preferido',
  'sensibilidad_cuero_cabelludo',
  'alergias',
  'productos_preferidos',
  'notas',
] as const satisfies readonly (keyof ClienteInput)[];

// DATE_FORMAT evita que la fecha de nacimiento (DATE) se convierta en Date con hora
const COLUMNS = `id, nombre, apellidos, telefono, email, DATE_FORMAT(fecha_nacimiento, '%Y-%m-%d') AS fecha_nacimiento,
  acepta_whatsapp, tipo_cabello, color_preferido, tipo_corte_preferido, sensibilidad_cuero_cabelludo,
  alergias, productos_preferidos, notas, activo, anonimizado_en, created_at, updated_at`;

export interface HistorialFila {
  cita_id: number;
  fecha_inicio: Date;
  estado: string;
  empleado_nombre: string;
  servicio_id: number;
  servicio_nombre: string;
  categoria: string;
  precio: number;
  duracion_minutos: number;
  notas_tecnicas: string | null;
  notas_cita: string | null;
}

export interface EstadisticasCliente {
  total_visitas: number;
  gasto_total: number;
  ultima_visita: Date | null;
  proxima_cita: Date | null;
  no_asistencias: number;
}

export const ClienteModel = {
  async list(filters: { q?: string | undefined; incluirInactivos?: boolean | undefined } & PageQuery, db: Db = pool) {
    const where: string[] = [];
    const params: SqlParam[] = [];

    if (!filters.incluirInactivos) where.push('activo = 1');
    if (filters.q) {
      const pattern = likePattern(filters.q);
      where.push('(nombre LIKE ? OR apellidos LIKE ? OR telefono LIKE ? OR email LIKE ?)');
      params.push(pattern, pattern, pattern, pattern);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { limit, offset } = toOffset(filters);

    // LIMIT/OFFSET como string: workaround conocido de mysql2 + MySQL 8 con execute()
    const items = await select<Cliente>(db, `SELECT ${COLUMNS} FROM clientes ${whereSql} ORDER BY nombre, apellidos LIMIT ? OFFSET ?`, [
      ...params,
      String(limit),
      String(offset),
    ]);
    const totalRow = await selectOne<{ total: number }>(db, `SELECT COUNT(*) AS total FROM clientes ${whereSql}`, params);
    return { items, total: totalRow?.total ?? 0 };
  },

  findById(id: number, db: Db = pool): Promise<Cliente | null> {
    return selectOne<Cliente>(db, `SELECT ${COLUMNS} FROM clientes WHERE id = ?`, [id]);
  },

  findByTelefono(telefono: string, db: Db = pool): Promise<Cliente | null> {
    return selectOne<Cliente>(db, `SELECT ${COLUMNS} FROM clientes WHERE telefono = ? AND activo = 1`, [telefono]);
  },

  async create(data: ClienteInput, db: Db = pool): Promise<number> {
    const { clause, values } = buildSet(data, EDITABLES);
    const result = await run(db, `INSERT INTO clientes SET ${clause}`, values);
    return result.insertId;
  },

  async update(id: number, data: ClienteInput, db: Db = pool): Promise<boolean> {
    const { clause, values } = buildSet(data, EDITABLES);
    if (!clause) return false;
    const result = await run(db, `UPDATE clientes SET ${clause} WHERE id = ?`, [...values, id]);
    return result.affectedRows > 0;
  },

  async setActivo(id: number, activo: boolean, db: Db = pool): Promise<boolean> {
    const result = await run(db, 'UPDATE clientes SET activo = ? WHERE id = ?', [activo, id]);
    return result.affectedRows > 0;
  },

  lockById(id: number, db: Db): Promise<Cliente | null> {
    return selectOne<Cliente>(db, `SELECT ${COLUMNS} FROM clientes WHERE id = ? FOR UPDATE`, [id]);
  },

  /**
   * RGPD (derecho de supresión): elimina todos los datos personales pero
   * conserva la fila, para que citas y cobros sigan cuadrando en contabilidad.
   */
  async anonimizar(id: number, ahora: Date, db: Db): Promise<void> {
    await run(
      db,
      `UPDATE clientes
          SET nombre = 'Cliente anonimizado', apellidos = NULL, telefono = NULL, email = NULL,
              fecha_nacimiento = NULL, acepta_whatsapp = 0, tipo_cabello = NULL, color_preferido = NULL,
              tipo_corte_preferido = NULL, sensibilidad_cuero_cabelludo = 'ninguna', alergias = NULL,
              productos_preferidos = NULL, notas = NULL, activo = 0, anonimizado_en = ?
        WHERE id = ?`,
      [ahora, id],
    );
  },

  historial(clienteId: number, db: Db = pool): Promise<HistorialFila[]> {
    return select<HistorialFila>(
      db,
      `SELECT cita_id, fecha_inicio, estado, empleado_nombre, servicio_id, servicio_nombre, categoria,
              precio, duracion_minutos, notas_tecnicas, notas_cita
         FROM v_historial_servicios_cliente
        WHERE cliente_id = ?
        ORDER BY fecha_inicio DESC, cita_id DESC
        LIMIT 500`,
      [clienteId],
    );
  },

  async estadisticas(clienteId: number, ahora: Date, db: Db = pool): Promise<EstadisticasCliente> {
    const row = await selectOne<EstadisticasCliente>(
      db,
      `SELECT
         COUNT(DISTINCT CASE WHEN c.estado = 'completada' THEN c.id END)                      AS total_visitas,
         COALESCE(SUM(CASE WHEN c.estado = 'completada' THEN cs.precio END), 0)               AS gasto_total,
         MAX(CASE WHEN c.estado = 'completada' THEN c.fecha_inicio END)                       AS ultima_visita,
         MIN(CASE WHEN c.estado IN ('pendiente', 'confirmada') AND c.fecha_inicio > ?
                  THEN c.fecha_inicio END)                                                    AS proxima_cita,
         COUNT(DISTINCT CASE WHEN c.estado = 'no_asistio' THEN c.id END)                      AS no_asistencias
       FROM citas c
       LEFT JOIN cita_servicios cs ON cs.cita_id = c.id
       WHERE c.cliente_id = ?`,
      [ahora, clienteId],
    );
    return {
      total_visitas: Number(row?.total_visitas ?? 0),
      gasto_total: Number(row?.gasto_total ?? 0),
      ultima_visita: row?.ultima_visita ?? null,
      proxima_cita: row?.proxima_cita ?? null,
      no_asistencias: Number(row?.no_asistencias ?? 0),
    };
  },
} as const;
