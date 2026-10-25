import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateStagingBackupTarget } from './validateStagingBackupTarget.mjs';

export function getExpectedRelationNames(auditSql) {
  const list = auditSql.match(
    /from unnest\(array\[([\s\S]*?)\]\) as feature\(name\)/i,
  )?.[1];
  if (!list) {
    throw new Error('Hosted schema audit does not declare expected feature relations.');
  }

  const names = [...list.matchAll(/'([a-z0-9_]+)'/gi)].map((match) => match[1]);
  if (names.length === 0 || new Set(names).size !== names.length) {
    throw new Error('Hosted schema audit relation inventory is empty or contains duplicates.');
  }
  return names;
}

export function getExpectedMigrationVersions(migrationFiles) {
  const versions = migrationFiles.map((file) => {
    const match = /^(\d{14})_[a-z0-9_]+\.sql$/i.exec(file);
    if (!match) {
      throw new Error(`Migration filename does not use the expected version format: ${file}`);
    }
    return match[1];
  });
  if (versions.length === 0 || new Set(versions).size !== versions.length) {
    throw new Error('Migration version inventory is empty or contains duplicates.');
  }
  return versions.sort();
}

export function buildSchemaAuditQuery(relationNames) {
  if (!relationNames.length || relationNames.some((name) => !/^[a-z0-9_]+$/.test(name))) {
    throw new Error('Schema audit relation names are invalid.');
  }

  const relations = relationNames.map((name) => `'${name}'`).join(', ');
  return `select jsonb_build_object(
  'relations', (
    select jsonb_object_agg(relation.name, to_regclass('public.' || relation.name) is not null)
    from unnest(array[${relations}]) as relation(name)
  ),
  'migration_history_exists', to_regclass('supabase_migrations.schema_migrations') is not null
);`;
}

export function buildMigrationVersionsQuery() {
  return "select coalesce(jsonb_agg(version::text order by version), '[]'::jsonb) from supabase_migrations.schema_migrations;";
}

export function buildPsqlEnvironment(connectionString, baseEnvironment = process.env) {
  const target = new URL(connectionString);
  const environment = { ...baseEnvironment };
  for (const name of Object.keys(environment)) {
    if (name.startsWith('PG')) delete environment[name];
  }
  delete environment.SUPABASE_DB_URL;
  delete environment.BACKUP_ENCRYPTION_KEY;

  let username;
  let password;
  let database;
  try {
    username = decodeURIComponent(target.username);
    password = decodeURIComponent(target.password);
    database = decodeURIComponent(target.pathname.replace(/^\//, ''));
  } catch {
    throw new Error('Staging database URL contains invalid encoded connection fields.');
  }

  return {
    ...environment,
    PGHOST: target.hostname,
    PGPORT: target.port || '5432',
    PGUSER: username,
    PGPASSWORD: password,
    PGDATABASE: database || 'postgres',
    PGSSLMODE: 'require',
    PGCONNECT_TIMEOUT: '20',
    PGAPPNAME: 'staging-schema-audit',
  };
}

export function renderSchemaAuditSummary(report, expectedMigrationVersions, appliedMigrationVersions) {
  const relations = report?.relations;
  if (!relations || typeof relations !== 'object' || Array.isArray(relations)) {
    throw new Error('Staging schema audit returned an invalid relations report.');
  }
  if (typeof report.migration_history_exists !== 'boolean') {
    throw new Error('Staging schema audit returned an invalid migration history status.');
  }
  if (!Array.isArray(expectedMigrationVersions) || !Array.isArray(appliedMigrationVersions)) {
    throw new Error('Staging schema audit returned an invalid migration version inventory.');
  }

  const missing = Object.entries(relations)
    .filter(([, exists]) => exists !== true)
    .map(([name]) => name)
    .sort();
  const presentCount = Object.keys(relations).length - missing.length;
  const expectedVersions = new Set(expectedMigrationVersions);
  const appliedVersions = new Set(appliedMigrationVersions);
  const unappliedVersions = [...expectedVersions].filter((version) => !appliedVersions.has(version));
  const unknownVersions = [...appliedVersions].filter((version) => !expectedVersions.has(version));
  const lines = [
    '## Staging schema inventory (read-only)',
    '',
    `- Expected feature relations present: ${presentCount}/${Object.keys(relations).length}`,
    `- Supabase migration history table: ${report.migration_history_exists === true ? 'found' : 'not found'}`,
  ];
  if (report.migration_history_exists === true) {
    lines.push(
      `- Repository migrations: ${expectedVersions.size}`,
      `- Hosted applied migrations: ${appliedVersions.size}`,
      `- Repository migrations absent from Staging history: ${unappliedVersions.length}`,
      `- Staging history versions absent from repository: ${unknownVersions.length}`,
    );
    if (unappliedVersions.length > 0) {
      lines.push('', `- Unapplied repository versions: ${unappliedVersions.sort().join(', ')}`);
    }
    if (unknownVersions.length > 0) {
      lines.push('', `- Unknown Staging history versions: ${unknownVersions.sort().join(', ')}`);
    }
  } else {
    lines.push(
      `- Repository migrations: ${expectedVersions.size}`,
      '- Hosted migration versions: unavailable because the history table is missing',
    );
  }
  if (missing.length > 0) {
    lines.push('', `- Missing public relations: ${missing.join(', ')}`);
  }
  return `${lines.join('\n')}\n`;
}

export async function auditStagingSchema({
  connectionString,
  auditSql,
  migrationFiles,
  runPsql = spawnSync,
}) {
  validateStagingBackupTarget(connectionString);
  const expectedMigrationVersions = getExpectedMigrationVersions(
    migrationFiles ?? await readdir(new URL('../supabase/migrations/', import.meta.url)),
  );
  const query = buildSchemaAuditQuery(getExpectedRelationNames(auditSql));
  const options = {
    encoding: 'utf8',
    env: buildPsqlEnvironment(connectionString),
  };
  const result = runPsql(
    'psql',
    ['--no-psqlrc', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '--command', query],
    options,
  );
  if (result.error || result.status !== 0) {
    throw new Error(`Staging schema audit failed to execute (psql exit ${result.status ?? 'unknown'}).`);
  }

  let report;
  try {
    report = JSON.parse(result.stdout.trim());
  } catch {
    throw new Error('Staging schema audit returned invalid JSON.');
  }

  let appliedMigrationVersions = [];
  if (report.migration_history_exists === true) {
    const migrationResult = runPsql(
      'psql',
      [
        '--no-psqlrc',
        '--set=ON_ERROR_STOP=1',
        '--tuples-only',
        '--no-align',
        '--command',
        buildMigrationVersionsQuery(),
      ],
      options,
    );
    if (migrationResult.error || migrationResult.status !== 0) {
      throw new Error(`Staging migration history audit failed to execute (psql exit ${migrationResult.status ?? 'unknown'}).`);
    }
    try {
      appliedMigrationVersions = JSON.parse(migrationResult.stdout.trim());
    } catch {
      throw new Error('Staging migration history audit returned invalid JSON.');
    }
    if (
      !Array.isArray(appliedMigrationVersions) ||
      appliedMigrationVersions.some((version) => typeof version !== 'string' || !/^\d{14}$/.test(version))
    ) {
      throw new Error('Staging migration history audit returned invalid migration versions.');
    }
  }
  return renderSchemaAuditSummary(report, expectedMigrationVersions, appliedMigrationVersions);
}

async function main() {
  const connectionString = process.env.SUPABASE_DB_URL || '';
  const auditSql = await readFile(
    new URL('../supabase/audit_hosted_schema.sql', import.meta.url),
    'utf8',
  );
  const migrationFiles = await readdir(new URL('../supabase/migrations/', import.meta.url));
  process.stdout.write(await auditStagingSchema({ connectionString, auditSql, migrationFiles }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`[staging-schema-audit] ${error.message}`);
    process.exitCode = 1;
  });
}
