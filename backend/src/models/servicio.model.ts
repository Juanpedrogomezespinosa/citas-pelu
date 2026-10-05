import { buildSet, placeholders, pool, run, select, selectOne, type Db } from '../config/database.js';

export const CATEGORIAS_SERVICIO = ['corte', 'color', 'tratamiento', 'peinado', 'barberia', 'otros'] as const;
export type CategoriaServicio = (typeof CATEGORIAS_SERVICIO)[number];

export interface Servicio {
  id: number;
  nombre: string;
  descripcion: string | null;
  categoria: CategoriaServicio;
  duracion_minutos: number;
  precio: number;
  activo: boolean;
}

export type ServicioInput = Partial<Omit<Servicio, 'id'>>;

const EDITABLES = [
  'nombre',
  'descripcion',
  'categoria',
  'duracion_minutos',
  'precio',
  'activo',
] as const satisfies readonly (keyof ServicioInput)[];
const COLUMNS = 'id, nombre, descripcion, categoria, duracion_minutos, precio, activo';

export const ServicioModel = {
  list({ incluirInactivos = false }: { incluirInactivos?: boolean | undefined } = {}, db: Db = pool): Promise<Servicio[]> {
    const where = incluirInactivos ? '' : 'WHERE activo = 1';
    return select<Servicio>(db, `SELECT ${COLUMNS} FROM servicios ${where} ORDER BY categoria, nombre`);
  },

  findById(id: number, db: Db = pool): Promise<Servicio | null> {
    return selectOne<Servicio>(db, `SELECT ${COLUMNS} FROM servicios WHERE id = ?`, [id]);
  },

  /**
   * Servicios activos con esos ids. Dentro de una reserva se llama con
   * `forShare` para que nadie desactive o borre un servicio mientras se usa.
   */
  findActiveByIds(ids: readonly number[], db: Db = pool, { forShare = false } = {}): Promise<Servicio[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return select<Servicio>(
      db,
      `SELECT ${COLUMNS} FROM servicios WHERE activo = 1 AND id IN (${placeholders(ids.length)})${forShare ? ' FOR SHARE' : ''}`,
      [...ids],
    );
  },

  async create(data: ServicioInput, db: Db = pool): Promise<number> {
    const { clause, values } = buildSet(data, EDITABLES);
    const result = await run(db, `INSERT INTO servicios SET ${clause}`, values);
    return result.insertId;
  },

  async update(id: number, data: ServicioInput, db: Db = pool): Promise<boolean> {
    const { clause, values } = buildSet(data, EDITABLES);
    if (!clause) return false;
    const result = await run(db, `UPDATE servicios SET ${clause} WHERE id = ?`, [...values, id]);
    return result.affectedRows > 0;
  },
} as const;
