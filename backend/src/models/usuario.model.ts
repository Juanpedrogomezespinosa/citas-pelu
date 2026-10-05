/**
 * Modelo Usuario: tipado de la tabla `usuarios` + acceso a datos.
 *
 * Convención de todos los modelos:
 *  - Exportan las interfaces de las filas y las constantes de dominio (enums).
 *  - Encapsulan el SQL de SU tabla. Las reglas de negocio y las transacciones
 *    viven en services/, que pasan la conexión de la transacción (`db`).
 *  - Solo SQL con placeholders `?` (sentencias preparadas).
 */
import { buildSet, pool, run, select, selectOne, type Db } from '../config/database.js';

export const ROLES = ['admin', 'recepcion', 'empleado'] as const;
export type Rol = (typeof ROLES)[number];

export interface Usuario {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
  debe_cambiar_password: boolean;
  token_version: number;
  ultimo_acceso: Date | null;
  created_at: Date;
}

interface UsuarioConPassword extends Usuario {
  password_hash: string;
}

export type UsuarioUpdate = Partial<Pick<Usuario, 'nombre' | 'rol' | 'activo'>>;
const EDITABLES = ['nombre', 'rol', 'activo'] as const satisfies readonly (keyof UsuarioUpdate)[];

const COLUMNS = 'id, nombre, email, rol, activo, debe_cambiar_password, token_version, ultimo_acceso, created_at';

export const UsuarioModel = {
  /** Incluye password_hash: usar SOLO para verificar credenciales */
  findByEmailWithPassword(email: string, db: Db = pool): Promise<UsuarioConPassword | null> {
    return selectOne<UsuarioConPassword>(db, `SELECT ${COLUMNS}, password_hash FROM usuarios WHERE email = ?`, [email]);
  },

  findByIdWithPassword(id: number, db: Db = pool): Promise<UsuarioConPassword | null> {
    return selectOne<UsuarioConPassword>(db, `SELECT ${COLUMNS}, password_hash FROM usuarios WHERE id = ?`, [id]);
  },

  findById(id: number, db: Db = pool): Promise<Usuario | null> {
    return selectOne<Usuario>(db, `SELECT ${COLUMNS} FROM usuarios WHERE id = ?`, [id]);
  },

  list(db: Db = pool): Promise<Usuario[]> {
    return select<Usuario>(db, `SELECT ${COLUMNS} FROM usuarios ORDER BY activo DESC, nombre`);
  },

  /** Bloquea la fila del usuario hasta el fin de la transacción */
  lockById(id: number, db: Db): Promise<Usuario | null> {
    return selectOne<Usuario>(db, `SELECT ${COLUMNS} FROM usuarios WHERE id = ? FOR UPDATE`, [id]);
  },

  /** Administradores activos, bloqueados: evita quedarse sin ningún admin por dos cambios concurrentes */
  lockAdminsActivos(db: Db): Promise<{ id: number }[]> {
    return select<{ id: number }>(db, "SELECT id FROM usuarios WHERE rol = 'admin' AND activo = 1 FOR UPDATE");
  },

  async create(
    data: { nombre: string; email: string; passwordHash: string; rol: Rol; debeCambiarPassword?: boolean },
    db: Db = pool,
  ): Promise<number> {
    const result = await run(db, 'INSERT INTO usuarios (nombre, email, password_hash, rol, debe_cambiar_password) VALUES (?, ?, ?, ?, ?)', [
      data.nombre,
      data.email,
      data.passwordHash,
      data.rol,
      data.debeCambiarPassword ?? false,
    ]);
    return result.insertId;
  },

  async update(id: number, data: UsuarioUpdate, db: Db = pool): Promise<boolean> {
    const { clause, values } = buildSet(data, EDITABLES);
    if (!clause) return false;
    // Cambiar rol o desactivar invalida las sesiones abiertas (token_version + 1)
    const result = await run(db, `UPDATE usuarios SET ${clause}, token_version = token_version + 1 WHERE id = ?`, [...values, id]);
    return result.affectedRows > 0;
  },

  /** Nueva contraseña + revocación de todas las sesiones emitidas antes */
  async setPassword(id: number, passwordHash: string, debeCambiar: boolean, db: Db = pool): Promise<void> {
    await run(db, 'UPDATE usuarios SET password_hash = ?, debe_cambiar_password = ?, token_version = token_version + 1 WHERE id = ?', [
      passwordHash,
      debeCambiar,
      id,
    ]);
  },

  async revocarSesiones(id: number, db: Db = pool): Promise<void> {
    await run(db, 'UPDATE usuarios SET token_version = token_version + 1 WHERE id = ?', [id]);
  },

  async touchLastLogin(id: number, at: Date, db: Db = pool): Promise<void> {
    await run(db, 'UPDATE usuarios SET ultimo_acceso = ? WHERE id = ?', [at, id]);
  },
} as const;
