/**
 * Pool de conexiones MySQL y helper de transacciones.
 *
 * - Pool (no una conexión única) para atender peticiones concurrentes.
 * - Todas las consultas usan placeholders `?` con `execute()`: sentencias
 *   preparadas reales en el servidor, lo que impide la inyección SQL.
 * - `withTransaction` encapsula BEGIN/COMMIT/ROLLBACK (atomicidad: o se aplican
 *   todos los cambios de una operación o ninguno).
 */
import mysql, { type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

/** Cualquier cosa capaz de ejecutar SQL: el pool o una conexión en transacción */
export type Db = Pool | PoolConnection;
export type SqlParam = string | number | boolean | Date | null;

export const pool: Pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  connectionLimit: env.DB_CONNECTION_LIMIT,
  waitForConnections: true,
  charset: 'utf8mb4',
  // DATETIME <-> Date en la zona horaria del proceso (APP_TIMEZONE)
  timezone: 'local',
  // DECIMAL -> number (los importes de una peluquería caben sin pérdida)
  decimalNumbers: true,
  // Nunca permitir varias sentencias en una llamada (defensa extra ante inyección)
  multipleStatements: false,
  // TINYINT(1) -> boolean (activo, acepta_whatsapp...). El resto, conversión por defecto.
  typeCast(field, next) {
    if (field.type === 'TINY' && field.length === 1) {
      const value = field.string();
      return value === null ? null : value === '1';
    }
    return next();
  },
});

/** SELECT tipado. Siempre con placeholders: nunca concatenar valores en `sql`. */
export async function select<T>(db: Db, sql: string, params: SqlParam[] = []): Promise<T[]> {
  const [rows] = await db.execute<RowDataPacket[]>(sql, params);
  return rows as T[];
}

export async function selectOne<T>(db: Db, sql: string, params: SqlParam[] = []): Promise<T | null> {
  const rows = await select<T>(db, sql, params);
  return rows[0] ?? null;
}

/** INSERT / UPDATE / DELETE */
export async function run(db: Db, sql: string, params: SqlParam[] = []): Promise<ResultSetHeader> {
  const [result] = await db.execute<ResultSetHeader>(sql, params);
  return result;
}

/**
 * Construye el SET de un UPDATE parcial con los campos definidos de `data`.
 * Los nombres de columna salen de `columns`, una lista blanca fija del modelo,
 * nunca de la entrada del usuario; los valores van como placeholders.
 */
export function buildSet<T extends object>(data: T, columns: readonly (keyof T & string)[]): { clause: string; values: SqlParam[] } {
  const present = columns.filter((column) => data[column] !== undefined);
  return {
    clause: present.map((column) => `${column} = ?`).join(', '),
    values: present.map((column) => data[column] as SqlParam),
  };
}

/** '?, ?, ?' para cláusulas IN con un número variable de valores */
export const placeholders = (count: number): string => Array.from({ length: count }, () => '?').join(', ');

/**
 * Ejecuta `fn(conn)` dentro de una transacción. Si `fn` lanza, ROLLBACK y se
 * propaga el error; el COMMIT termina antes de devolver, así el controlador
 * solo responde al cliente cuando los datos ya son durables.
 *
 * Aislamiento: REPEATABLE READ (por defecto en InnoDB). Las operaciones
 * críticas añaden bloqueos explícitos `SELECT ... FOR UPDATE`.
 */
export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback().catch((rollbackError: Error) => logger.error('Error al hacer ROLLBACK', { error: rollbackError.message }));
    throw error;
  } finally {
    conn.release();
  }
}

export async function pingDatabase(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
  } finally {
    conn.release();
  }
}
