/**
 * Instancia de Knex usada SOLO como gestor de migraciones (las consultas de la
 * aplicación van con mysql2 y sentencias preparadas). La comparten el CLI
 * (migrate.ts) y los tests de integración.
 *
 * Fuente de migraciones propia: Knex, por defecto, guarda en knex_migrations el
 * nombre del fichero CON extensión. En desarrollo se ejecutan los .ts (tsx) y
 * en producción los .js compilados, así que una base migrada en un entorno se
 * daría por "corrupta" en el otro. Aquí se registran los nombres sin extensión.
 */
import { readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import knexFactory, { type Knex } from 'knex';
import { env } from '../config/env.js';

const DIRECTORIO = fileURLToPath(new URL('./migrations', import.meta.url));
const EXTENSION = import.meta.url.endsWith('.ts') ? '.ts' : '.js';

interface ModuloMigracion {
  up: (knex: Knex) => Promise<void>;
  down: (knex: Knex) => Promise<void>;
  config?: { transaction?: boolean };
}

const fuenteMigraciones: Knex.MigrationSource<string> = {
  async getMigrations() {
    const ficheros = await readdir(DIRECTORIO);
    return ficheros
      .filter((f) => f.endsWith(EXTENSION) && !f.endsWith('.d.ts'))
      .sort()
      .map((f) => f.slice(0, -EXTENSION.length));
  },
  getMigrationName: (nombre) => nombre,
  async getMigration(nombre) {
    return (await import(pathToFileURL(`${DIRECTORIO}/${nombre}${EXTENSION}`).href)) as ModuloMigracion;
  },
};

export function crearMigrador(database: string = env.DB_NAME): Knex {
  return knexFactory({
    client: 'mysql2',
    connection: {
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database,
      charset: 'utf8mb4',
    },
    migrations: { migrationSource: fuenteMigraciones, tableName: 'knex_migrations' },
  });
}
