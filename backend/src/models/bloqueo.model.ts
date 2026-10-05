/**
 * Bloqueos de agenda: vacaciones, festivos, bajas... Un bloqueo sin
 * empleado_id afecta a todo el local.
 */
import { pool, run, select, selectOne, type Db, type SqlParam } from '../config/database.js';

export const TIPOS_BLOQUEO = ['vacaciones', 'festivo', 'baja', 'formacion', 'otro'] as const;
export type TipoBloqueo = (typeof TIPOS_BLOQUEO)[number];

export interface Bloqueo {
  id: number;
  empleado_id: number | null;
  empleado_nombre: string | null;
  tipo: TipoBloqueo;
  fecha_inicio: Date;
  fecha_fin: Date;
  motivo: string | null;
  creado_por: number | null;
}

const SELECT = `
  SELECT b.id, b.empleado_id, CONCAT_WS(' ', e.nombre, e.apellidos) AS empleado_nombre, b.tipo,
         b.fecha_inicio, b.fecha_fin, b.motivo, b.creado_por
    FROM bloqueos_agenda b
    LEFT JOIN empleados e ON e.id = b.empleado_id`;

export const BloqueoModel = {
  /** Bloqueos que se solapan con [desde, hasta). Con empleadoId: los suyos + los de todo el local. */
  list(f: { desde: Date; hasta: Date; empleadoId?: number | undefined }, db: Db = pool): Promise<Bloqueo[]> {
    const params: SqlParam[] = [f.hasta, f.desde];
    let filtro = '';
    if (f.empleadoId) {
      filtro = 'AND (b.empleado_id = ? OR b.empleado_id IS NULL)';
      params.push(f.empleadoId);
    }
    return select<Bloqueo>(db, `${SELECT} WHERE b.fecha_inicio < ? AND b.fecha_fin > ? ${filtro} ORDER BY b.fecha_inicio`, params);
  },

  findById(id: number, db: Db = pool): Promise<Bloqueo | null> {
    return selectOne<Bloqueo>(db, `${SELECT} WHERE b.id = ?`, [id]);
  },

  /** Primer bloqueo que impide atender en [inicio, fin) a ese empleado (propio o del local) */
  findQueAfecta(empleadoId: number, inicio: Date, fin: Date, db: Db = pool): Promise<Bloqueo | null> {
    return selectOne<Bloqueo>(
      db,
      `${SELECT} WHERE (b.empleado_id = ? OR b.empleado_id IS NULL) AND b.fecha_inicio < ? AND b.fecha_fin > ? LIMIT 1`,
      [empleadoId, fin, inicio],
    );
  },

  async insert(
    data: Pick<Bloqueo, 'empleado_id' | 'tipo' | 'fecha_inicio' | 'fecha_fin' | 'motivo' | 'creado_por'>,
    db: Db = pool,
  ): Promise<number> {
    const result = await run(
      db,
      'INSERT INTO bloqueos_agenda (empleado_id, tipo, fecha_inicio, fecha_fin, motivo, creado_por) VALUES (?, ?, ?, ?, ?, ?)',
      [data.empleado_id, data.tipo, data.fecha_inicio, data.fecha_fin, data.motivo, data.creado_por],
    );
    return result.insertId;
  },

  async delete(id: number, db: Db = pool): Promise<boolean> {
    const result = await run(db, 'DELETE FROM bloqueos_agenda WHERE id = ?', [id]);
    return result.affectedRows > 0;
  },
} as const;
