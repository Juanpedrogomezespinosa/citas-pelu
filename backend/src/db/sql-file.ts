/**
 * Ejecuta un fichero .sql sentencia a sentencia con Knex.
 *
 * Mantener las migraciones en SQL plano permite leerlas y revisarlas como el
 * "script de creación de la base de datos", mientras Knex lleva el control de
 * versiones (tabla knex_migrations) y la reversibilidad (up/down).
 * Convención: cada sentencia termina con ';' al final de una línea.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Knex } from 'knex';

const SQL_DIR = new URL('./sql/', import.meta.url);

export function splitStatements(sql: string): string[] {
  return sql
    .split(/;\s*$/m)
    .map((chunk) =>
      chunk
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter(Boolean);
}

export async function runSqlFile(knex: Knex, fileName: string): Promise<void> {
  const sql = await readFile(fileURLToPath(new URL(fileName, SQL_DIR)), 'utf8');
  for (const statement of splitStatements(sql)) {
    await knex.raw(statement);
  }
}
