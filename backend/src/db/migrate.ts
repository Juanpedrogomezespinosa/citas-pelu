/**
 * CLI de migraciones.
 *
 *   npm run db:migrate    -> aplica las pendientes
 *   npm run db:rollback   -> revierte el último lote
 *   npm run db:status     -> lista aplicadas y pendientes
 *
 * Nueva migración: src/db/migrations/<timestamp>_<nombre>.ts con `up` y `down`
 * (y sus .sql en src/db/sql/ si es SQL plano). Nunca edites una ya aplicada.
 */
import { crearMigrador } from './migrator.js';

const command = process.argv[2] ?? 'latest';
const knex = crearMigrador();

try {
  switch (command) {
    case 'latest': {
      const [batch, applied] = (await knex.migrate.latest()) as [number, string[]];
      console.log(applied.length ? `✅ Lote ${batch}: ${applied.join(', ')}` : '✅ Base de datos al día');
      break;
    }
    case 'rollback': {
      const [batch, reverted] = (await knex.migrate.rollback()) as [number, string[]];
      console.log(reverted.length ? `↩️  Lote ${batch} revertido: ${reverted.join(', ')}` : 'Nada que revertir');
      break;
    }
    case 'status': {
      const [done, pending] = (await knex.migrate.list()) as [{ name: string }[], { file: string }[]];
      console.log(
        'Aplicadas:',
        done.map((m) => m.name),
      );
      console.log(
        'Pendientes:',
        pending.map((m) => m.file),
      );
      break;
    }
    default:
      console.error(`Comando desconocido: ${command} (usa latest | rollback | status)`);
      process.exitCode = 1;
  }
} catch (error) {
  console.error('❌ Error en la migración:', (error as Error).message);
  process.exitCode = 1;
} finally {
  await knex.destroy();
}
