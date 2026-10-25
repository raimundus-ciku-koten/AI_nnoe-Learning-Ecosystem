import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateStagingBackupTarget } from './validateStagingBackupTarget.mjs';

const EXPECTED_FEATURE_RELATION_COUNT = 61;

export function getExpectedRelationNames(auditSql) {
  const list = auditSql.match(
    /from unnest\(array\[([\s\S]*?)\]\) as feature\(name\)/i,
  )?.[1];
  if (!list) {
    throw new Error('Hosted schema audit does not declare expected feature relations.');
  }

  const names = [...list.matchAll(/'([a-z0-9_]+)'/gi)].map((match) => match[1]);
  if (
    names.length !== EXPECTED_FEATURE_RELATION_COUNT
    || new Set(names).size !== names.length
  ) {
    throw new Error('Hosted schema audit must declare exactly 61 unique feature relations.');
  }
  return names;
}

export function getExpectedMigrationVersions(migrationFiles) {
  if (!Array.isArray(migrationFiles) || migrationFiles.length === 0) {
    throw new Error('Migration version inventory is empty or invalid.');
  }
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
  'relation_details', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', feature.name,
      'row_level_security', relation_class.relrowsecurity,
      'force_row_level_security', relation_class.relforcerowsecurity,
      'columns', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'name', column_info.column_name,
          'type', column_info.udt_schema || '.' || column_info.udt_name,
          'nullable', column_info.is_nullable = 'YES',
          'default', column_info.column_default
        ) order by column_info.ordinal_position), '[]'::jsonb)
        from information_schema.columns as column_info
        where column_info.table_schema = 'public'
          and column_info.table_name = feature.name
      ),
      'constraints', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'name', constraint_info.conname,
          'type', constraint_info.contype,
          'definition', pg_get_constraintdef(constraint_info.oid)
        ) order by constraint_info.conname), '[]'::jsonb)
        from pg_constraint as constraint_info
        where constraint_info.conrelid = relation_class.oid
      ),
      'policies', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'name', policy.policyname,
          'command', policy.cmd,
          'roles', policy.roles,
          'using', policy.qual,
          'with_check', policy.with_check
        ) order by policy.policyname), '[]'::jsonb)
        from pg_policies as policy
        where policy.schemaname = 'public'
          and policy.tablename = feature.name
      )
    ) order by feature.name), '[]'::jsonb)
    from unnest(array[${relations}]) as feature(name)
    join pg_class as relation_class
      on relation_class.relname = feature.name
    join pg_namespace as relation_namespace
      on relation_namespace.oid = relation_class.relnamespace
      and relation_namespace.nspname = 'public'
    where relation_class.relkind in ('r', 'p', 'v', 'm', 'f')
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

export function renderSchemaAuditSummary(
  report,
  expectedMigrationVersions,
  appliedMigrationVersions,
) {
  const relations = report?.relations;
  if (!relations || typeof relations !== 'object' || Array.isArray(relations)) {
    throw new Error('Staging schema audit returned an invalid relations report.');
  }
  if (Object.keys(relations).length !== EXPECTED_FEATURE_RELATION_COUNT) {
    throw new Error('Staging schema audit returned an incomplete feature relation inventory.');
  }
  if (!Array.isArray(report.relation_details)) {
    throw new Error('Staging schema audit returned an invalid relation metadata report.');
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
  const present = Object.entries(relations)
    .filter(([, exists]) => exists === true)
    .map(([name]) => name)
    .sort();
  const presentCount = Object.keys(relations).length - missing.length;
  const expectedVersions = new Set(expectedMigrationVersions);
  const appliedVersions = new Set(appliedMigrationVersions);
  const unappliedVersions = [...expectedVersions].filter((version) => !appliedVersions.has(version));
  const unknownVersions = [...appliedVersions].filter((version) => !expectedVersions.has(version));
  const readinessBlockers = [];
  if (missing.length > 0) {
    readinessBlockers.push(`${missing.length} expected feature relations missing`);
  }
  if (report.migration_history_exists !== true) {
    readinessBlockers.push('hosted migration ledger missing');
  } else {
    if (unappliedVersions.length > 0) {
      readinessBlockers.push(`${unappliedVersions.length} repository migrations not recorded`);
    }
    if (unknownVersions.length > 0) {
      readinessBlockers.push(`${unknownVersions.length} unknown hosted migration versions`);
    }
  }
  const lines = [
    '## Staging schema inventory (read-only)',
    '',
    `- Relation/history inventory readiness: ${readinessBlockers.length === 0 ? 'READY' : `BLOCKED (${readinessBlockers.join('; ')})`}`,
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
  if (present.length > 0) {
    lines.push('', `- Present public relations: ${present.join(', ')}`);
  }
  if (report.relation_details.length > 0) {
    lines.push('', '### Metadata for present expected relations', '', '```json');
    lines.push(JSON.stringify(report.relation_details, null, 2), '```');
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
  const migrationFiles = (await readdir(new URL('../supabase/migrations/', import.meta.url)))
    .filter((file) => file.endsWith('.sql'));
  process.stdout.write(await auditStagingSchema({ connectionString, auditSql, migrationFiles }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`[staging-schema-audit] ${error.message}`);
    process.exitCode = 1;
  });
}
