import type { Knex } from 'knex';
import { runSqlFile } from '../sql-file.js';

/*
 * MySQL hace COMMIT implícito con cada DDL, así que una migración de esquema no
 * puede ser atómica: si falla a mitad, `down` usa DROP ... IF EXISTS para
 * poder limpiar cualquier estado intermedio y volver a empezar.
 */
export const config = { transaction: false };

export async function up(knex: Knex): Promise<void> {
  await runSqlFile(knex, '0001_initial_schema.up.sql');
}

export async function down(knex: Knex): Promise<void> {
  await runSqlFile(knex, '0001_initial_schema.down.sql');
}
