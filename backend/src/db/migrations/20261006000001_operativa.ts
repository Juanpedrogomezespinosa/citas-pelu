import type { Knex } from 'knex';
import { runSqlFile } from '../sql-file.js';

// DDL en MySQL = COMMIT implícito: la migración no es atómica (ver 0001)
export const config = { transaction: false };

export async function up(knex: Knex): Promise<void> {
  await runSqlFile(knex, '0002_operativa.up.sql');
}

export async function down(knex: Knex): Promise<void> {
  await runSqlFile(knex, '0002_operativa.down.sql');
}
