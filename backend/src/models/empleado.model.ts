import { buildSet, pool, run, select, selectOne, type Db } from '../config/database.js';

export interface Empleado {
  id: number;
  usuario_id: number | null;
  nombre: string;
  apellidos: string | null;
  telefono: string | null;
  email: string | null;
  especialidad: string | null;
  color_calendario: string;
  activo: boolean;
}

/** dia_semana: 0 = domingo ... 6 = sábado (igual que Date.getDay()) */
export interface TramoHorario {
  dia_semana: number;
  hora_inicio: string; // 'HH:mm'
  hora_fin: string; // 'HH:mm'
}

export type EmpleadoInput = Partial<Omit<Empleado, 'id'>>;

const EDITABLES = [
  'usuario_id',
  'nombre',
  'apellidos',
  'telefono',
  'email',
  'especialidad',
  'color_calendario',
  'activo',
] as const satisfies readonly (keyof EmpleadoInput)[];

const COLUMNS = 'id, usuario_id, nombre, apellidos, telefono, email, especialidad, color_calendario, activo';

export const EmpleadoModel = {
  list({ incluirInactivos = false }: { incluirInactivos?: boolean | undefined } = {}, db: Db = pool): Promise<Empleado[]> {
    const where = incluirInactivos ? '' : 'WHERE activo = 1';
    return select<Empleado>(db, `SELECT ${COLUMNS} FROM empleados ${where} ORDER BY nombre, apellidos`);
  },

  findById(id: number, db: Db = pool): Promise<Empleado | null> {
    return selectOne<Empleado>(db, `SELECT ${COLUMNS} FROM empleados WHERE id = ?`, [id]);
  },

  /**
   * Bloquea la fila del empleado hasta el fin de la transacción.
   * Es el "mutex" de su agenda: dos reservas concurrentes para el mismo
   * empleado se serializan aquí, así que la comprobación de solapes que viene
   * después no puede sufrir una condición de carrera.
   */
  lockById(id: number, db: Db): Promise<Empleado | null> {
    return selectOne<Empleado>(db, `SELECT ${COLUMNS} FROM empleados WHERE id = ? FOR UPDATE`, [id]);
  },

  async create(data: EmpleadoInput, db: Db = pool): Promise<number> {
    const { clause, values } = buildSet(data, EDITABLES);
    const result = await run(db, `INSERT INTO empleados SET ${clause}`, values);
    return result.insertId;
  },

  async update(id: number, data: EmpleadoInput, db: Db = pool): Promise<boolean> {
    const { clause, values } = buildSet(data, EDITABLES);
    if (!clause) return false;
    const result = await run(db, `UPDATE empleados SET ${clause} WHERE id = ?`, [...values, id]);
    return result.affectedRows > 0;
  },

  getHorarios(empleadoId: number, db: Db = pool): Promise<TramoHorario[]> {
    return select<TramoHorario>(
      db,
      `SELECT dia_semana, TIME_FORMAT(hora_inicio, '%H:%i') AS hora_inicio, TIME_FORMAT(hora_fin, '%H:%i') AS hora_fin
         FROM horarios_empleado WHERE empleado_id = ? ORDER BY dia_semana, hora_inicio`,
      [empleadoId],
    );
  },

  /** Sustituye el horario completo. Llamar dentro de una transacción. */
  async replaceHorarios(empleadoId: number, tramos: readonly TramoHorario[], db: Db): Promise<void> {
    await run(db, 'DELETE FROM horarios_empleado WHERE empleado_id = ?', [empleadoId]);
    for (const t of tramos) {
      await run(db, 'INSERT INTO horarios_empleado (empleado_id, dia_semana, hora_inicio, hora_fin) VALUES (?, ?, ?, ?)', [
        empleadoId,
        t.dia_semana,
        t.hora_inicio,
        t.hora_fin,
      ]);
    }
  },
} as const;
