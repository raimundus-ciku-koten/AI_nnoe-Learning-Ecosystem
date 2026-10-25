import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  auditStagingSchema,
  buildSchemaAuditQuery,
  buildMigrationVersionsQuery,
  buildPsqlEnvironment,
  getExpectedMigrationVersions,
  getExpectedRelationNames,
  renderSchemaAuditSummary,
} from './auditStagingSchema.mjs';

const auditSql = await readFile(
  new URL('../supabase/audit_hosted_schema.sql', import.meta.url),
  'utf8',
);

test('builds a read-only inventory query from the audited relation list', () => {
  const names = getExpectedRelationNames(auditSql);
  const query = buildSchemaAuditQuery(names);

  assert.ok(names.includes('learning_classrooms'));
  assert.match(query, /to_regclass\('public\.' \|\| relation\.name\)/);
  assert.match(query, /to_regclass\('supabase_migrations\.schema_migrations'\)/);
  assert.match(query, /from pg_policies as policy/);
  assert.match(query, /force_row_level_security/);
  assert.doesNotMatch(query, /\b(insert|update|delete|alter|drop|grant|revoke|truncate)\b/i);
});

test('validates and queries versioned migration filenames without mutating Staging', () => {
  assert.deepEqual(
    getExpectedMigrationVersions([
      '20261016000100_identity_foundation.sql',
      '20261017000100_platform_user_management.sql',
    ]),
    ['20261016000100', '20261017000100'],
  );
  assert.throws(
    () => getExpectedMigrationVersions(['unversioned.sql']),
    /expected version format/,
  );
  assert.throws(
    () => getExpectedMigrationVersions([]),
    /empty or invalid/,
  );
  assert.match(buildMigrationVersionsQuery(), /^select coalesce\(jsonb_agg/);
  assert.doesNotMatch(buildMigrationVersionsQuery(), /\b(insert|update|delete|alter|drop|truncate)\b/i);
});

test('reports missing feature relations and migration history without exposing connection details', async () => {
  let executedQuery = '';
  let psqlEnvironment;
  const summary = await auditStagingSchema({
    connectionString: 'postgresql://postgres.samszhfyhbjuculrcffg:secret@aws-0-ap-south-1.pooler.supabase.com:5432/postgres',
    auditSql,
    runPsql: (_command, args, options) => {
      executedQuery = args.at(-1);
      psqlEnvironment = options.env;
      return {
        status: 0,
        stdout: JSON.stringify({
          relations: { learning_classrooms: false, students: true },
          relation_details: [{
            name: 'students',
            row_level_security: true,
            force_row_level_security: false,
            columns: [{ name: 'id', type: 'pg_catalog.uuid', nullable: false, default: null }],
            constraints: [],
            policies: [{
              name: 'student scope',
              command: 'SELECT',
              roles: ['authenticated'],
              using: 'tenant_id = current_tenant_id()',
              with_check: null,
            }],
          }],
          migration_history_exists: false,
        }),
      };
    },
  });

  assert.match(summary, /Expected feature relations present: 1\/2/);
  assert.match(summary, /migration history table: not found/);
  assert.match(summary, /Repository migrations: [1-9]\d*/);
  assert.match(summary, /Hosted migration versions: unavailable/);
  assert.match(summary, /Missing public relations: learning_classrooms/);
  assert.match(summary, /Present public relations: students/);
  assert.match(summary, /"row_level_security": true/);
  assert.match(summary, /"student scope"/);
  assert.doesNotMatch(summary, /secret|postgresql:\/\//i);
  assert.match(executedQuery, /learning_classrooms/);
  assert.equal(psqlEnvironment.PGHOST, 'aws-0-ap-south-1.pooler.supabase.com');
  assert.equal(psqlEnvironment.PGUSER, 'postgres.samszhfyhbjuculrcffg');
  assert.equal(psqlEnvironment.PGPASSWORD, 'secret');
  assert.equal(psqlEnvironment.PGDATABASE, 'postgres');
  assert.equal(psqlEnvironment.PGSSLMODE, 'require');
  assert.equal('SUPABASE_DB_URL' in psqlEnvironment, false);
  assert.equal('BACKUP_ENCRYPTION_KEY' in psqlEnvironment, false);
});

test('compares repository and hosted migration versions when a history table exists', async () => {
  const summary = await auditStagingSchema({
    connectionString: 'postgresql://postgres.samszhfyhbjuculrcffg:pw@aws-0-ap-south-1.pooler.supabase.com:5432/postgres',
    auditSql,
    migrationFiles: [
      '20261016000100_identity_foundation.sql',
      '20261017000100_platform_user_management.sql',
    ],
    runPsql: (_command, args) => ({
      status: 0,
      stdout: args.at(-1).includes('to_regclass')
        ? JSON.stringify({
            relations: { learning_classrooms: true },
            relation_details: [],
            migration_history_exists: true,
          })
        : JSON.stringify(['20261016000100', '20261017000999']),
    }),
  });

  assert.match(summary, /Repository migrations: 2/);
  assert.match(summary, /Hosted applied migrations: 2/);
  assert.match(summary, /Repository migrations absent from Staging history: 1/);
  assert.match(summary, /Staging history versions absent from repository: 1/);
  assert.match(summary, /Unapplied repository versions: 20261017000100/);
  assert.match(summary, /Unknown Staging history versions: 20261017000999/);
});

test('parses encoded PostgreSQL connection fields without inheriting PG overrides', () => {
  const environment = buildPsqlEnvironment(
    'postgresql://postgres.samszhfyhbjuculrcffg:encoded%40password@aws-0-ap-south-1.pooler.supabase.com:6543/postgres',
    { PATH: 'system-path', PGHOST: 'wrong-host', PGDATABASE: 'wrong-db' },
  );

  assert.equal(environment.PGHOST, 'aws-0-ap-south-1.pooler.supabase.com');
  assert.equal(environment.PGPORT, '6543');
  assert.equal(environment.PGPASSWORD, 'encoded@password');
  assert.equal(environment.PGDATABASE, 'postgres');
  assert.equal(environment.PGSSLMODE, 'require');
  assert.equal(environment.PATH, 'system-path');
});

test('rejects non-Staging URLs before invoking psql', async () => {
  let invoked = false;
  await assert.rejects(
    auditStagingSchema({
      connectionString: 'postgresql://postgres.jvcrmzmuxgyuetkjqady:secret@db.jvcrmzmuxgyuetkjqady.supabase.co:5432/postgres',
      auditSql,
      runPsql: () => {
        invoked = true;
        return { status: 0, stdout: '{}' };
      },
    }),
    /configured Staging database only/,
  );
  assert.equal(invoked, false);
});

test('rejects malformed or failed psql reports explicitly', () => {
  assert.throws(
    () => renderSchemaAuditSummary({ relations: [], migration_history_exists: false }),
    /invalid relations report/,
  );
});
