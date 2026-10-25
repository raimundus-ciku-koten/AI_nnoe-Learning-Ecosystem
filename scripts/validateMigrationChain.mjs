import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function getOrderedMigrationFiles(files) {
  const migrations = files.filter((file) => file.endsWith('.sql')).sort();
  const versions = migrations.map((file) => {
    const match = /^(\d{14})_[a-z0-9_]+\.sql$/i.exec(file);
    if (!match) {
      throw new Error(`Migration filename does not use the expected version format: ${file}`);
    }
    return match[1];
  });
  if (migrations.length === 0 || new Set(versions).size !== versions.length) {
    throw new Error('Migration chain is empty or contains duplicate versions.');
  }
  return migrations;
}

function buildLocalDatabaseEnvironment(environment) {
  const allowed = environment.PGHOST === '127.0.0.1'
    && environment.PGPORT === '5432'
    && environment.PGUSER === 'supabase_admin'
    && environment.PGDATABASE === 'backup_restore_validation';
  if (!allowed) {
    throw new Error('Migration-chain validation is restricted to the disposable restored Staging clone.');
  }

  const psqlEnvironment = { ...environment, PGAPPNAME: 'migration-chain-validation' };
  delete psqlEnvironment.SUPABASE_DB_URL;
  delete psqlEnvironment.BACKUP_ENCRYPTION_KEY;
  return psqlEnvironment;
}

export async function validateMigrationChain({
  migrationDirectory,
  migrationFiles,
  environment = process.env,
  runCommand = spawnSync,
}) {
  const psqlEnvironment = buildLocalDatabaseEnvironment(environment);
  const orderedMigrationFiles = getOrderedMigrationFiles(
    migrationFiles ?? await readdir(migrationDirectory),
  );
  for (const file of orderedMigrationFiles) {
    const result = runCommand(
      'psql',
      [
        '--no-psqlrc',
        '--set=ON_ERROR_STOP=1',
        '--single-transaction',
        '--file',
        join(migrationDirectory, file),
      ],
      { encoding: 'utf8', env: psqlEnvironment },
    );
    if (result.error || result.status !== 0) {
      throw new Error(`Migration-chain validation failed at ${file}; only the restored disposable clone was targeted.`);
    }
  }

  return `Validated ${orderedMigrationFiles.length} migrations in version order on the restored disposable Staging clone.`;
}

async function main() {
  const result = await validateMigrationChain({
    migrationDirectory: fileURLToPath(new URL('../supabase/migrations/', import.meta.url)),
  });
  process.stdout.write(`${result}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[migration-chain-validation] ${error.message}`);
    process.exitCode = 1;
  });
}
