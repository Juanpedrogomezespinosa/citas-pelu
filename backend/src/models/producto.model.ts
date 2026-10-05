import { buildSet, placeholders, pool, run, select, selectOne, type Db } from '../config/database.js';

export interface Producto {
  id: number;
  nombre: string;
  descripcion: string | null;
  precio: number;
  stock: number;
  activo: boolean;
}

export type ProductoInput = Partial<Omit<Producto, 'id'>>;

const EDITABLES = ['nombre', 'descripcion', 'precio', 'stock', 'activo'] as const satisfies readonly (keyof ProductoInput)[];
const COLUMNS = 'id, nombre, descripcion, precio, stock, activo';

export const ProductoModel = {
  list({ incluirInactivos = false }: { incluirInactivos?: boolean | undefined } = {}, db: Db = pool): Promise<Producto[]> {
    return select<Producto>(db, `SELECT ${COLUMNS} FROM productos ${incluirInactivos ? '' : 'WHERE activo = 1'} ORDER BY nombre`);
  },

  findById(id: number, db: Db = pool): Promise<Producto | null> {
    return selectOne<Producto>(db, `SELECT ${COLUMNS} FROM productos WHERE id = ?`, [id]);
  },

  /**
   * Bloquea los productos de una venta, SIEMPRE en orden de id (evita
   * interbloqueos entre dos cobros con los mismos productos en distinto orden).
   */
  lockByIds(ids: readonly number[], db: Db): Promise<Producto[]> {
    if (ids.length === 0) return Promise.resolve([]);
    const ordenados = [...new Set(ids)].sort((a, b) => a - b);
    return select<Producto>(
      db,
      `SELECT ${COLUMNS} FROM productos WHERE id IN (${placeholders(ordenados.length)}) ORDER BY id FOR UPDATE`,
      ordenados,
    );
  },

  /**
   * Descuenta stock. La condición `stock >= ?` es una segunda barrera (además
   * del bloqueo y de la columna UNSIGNED): nunca se vende lo que no hay.
   */
  async descontarStock(id: number, cantidad: number, db: Db): Promise<boolean> {
    const result = await run(db, 'UPDATE productos SET stock = stock - ? WHERE id = ? AND stock >= ?', [cantidad, id, cantidad]);
    return result.affectedRows === 1;
  },

  async reponerStock(id: number, cantidad: number, db: Db): Promise<void> {
    await run(db, 'UPDATE productos SET stock = stock + ? WHERE id = ?', [cantidad, id]);
  },

  async create(data: ProductoInput, db: Db = pool): Promise<number> {
    const { clause, values } = buildSet(data, EDITABLES);
    const result = await run(db, `INSERT INTO productos SET ${clause}`, values);
    return result.insertId;
  },

  async update(id: number, data: ProductoInput, db: Db = pool): Promise<boolean> {
    const { clause, values } = buildSet(data, EDITABLES);
    if (!clause) return false;
    const result = await run(db, `UPDATE productos SET ${clause} WHERE id = ?`, [...values, id]);
    return result.affectedRows > 0;
  },
} as const;
