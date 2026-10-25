import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getOrderedMigrationFiles,
  validateMigrationChain,
} from './validateMigrationChain.mjs';
import { getExpectedRelationNames } from './auditStagingSchema.mjs';
import { readFile } from 'node:fs/promises';

const auditSql = await readFile(
  new URL('../supabase/audit_hosted_schema.sql', import.meta.url),
  'utf8',
);
const expectedRelations = getExpectedRelationNames(auditSql);

const environment = {
  PGHOST: '127.0.0.1',
  PGPORT: '5432',
  PGUSER: 'supabase_admin',
  PGDATABASE: 'postgres',
  PGPASSWORD: 'local-only',
  SUPABASE_DB_URL: 'must-not-be-inherited',
  BACKUP_ENCRYPTION_KEY: 'must-not-be-inherited',
};

test('orders versioned SQL files and rejects duplicate or malformed versions', () => {
  assert.deepEqual(
    getOrderedMigrationFiles([
      '20261017000100_platform_user_management.sql',
      '20261016000100_identity_foundation.sql',
      'README.md',
    ]),
    [
      '20261016000100_identity_foundation.sql',
      '20261017000100_platform_user_management.sql',
    ],
  );
  assert.throws(
    () => getOrderedMigrationFiles(['20261016000100_first.sql', '20261016000100_second.sql']),
    /duplicate versions/,
  );
  assert.throws(
    () => getOrderedMigrationFiles(['migration.sql']),
    /expected version format/,
  );
});

test('replays each migration then verifies all expected feature relations on the clean disposable database', async () => {
  const calls = [];
  const result = await validateMigrationChain({
    migrationDirectory: 'C:\\migrations',
    auditSql,
    migrationFiles: [
      '20261017000100_platform_user_management.sql',
      '20261016000100_identity_foundation.sql',
    ],
    environment,
    runCommand: (command, args, options) => {
      calls.push({ command, args, options });
      return args.includes('--command')
        ? { status: 0, stdout: JSON.stringify({ relations: Object.fromEntries(expectedRelations.map((name) => [name, true])) }) }
        : { status: 0 };
    },
  });

  assert.match(result, new RegExp(`Validated 2 migrations and all ${expectedRelations.length} expected feature relations`));
  assert.equal(calls.length, 3);
  assert.ok(calls.every((call) => call.command === 'psql'));
  assert.ok(calls[0].args.includes('--single-transaction'));
  assert.match(calls[0].args.at(-1), /20261016000100_identity_foundation\.sql$/);
  assert.equal(calls[0].options.env.PGDATABASE, 'postgres');
  assert.equal('SUPABASE_DB_URL' in calls[0].options.env, false);
  assert.equal('BACKUP_ENCRYPTION_KEY' in calls[0].options.env, false);
  assert.ok(calls[2].args.includes('--command'));
});

test('stops at the first failed migration without echoing connection details', async () => {
  let migrationCalls = 0;
  await assert.rejects(
    validateMigrationChain({
      migrationDirectory: 'C:\\migrations',
      auditSql,
      migrationFiles: [
        '20261016000100_identity_foundation.sql',
        '20261017000100_platform_user_management.sql',
      ],
      environment,
      runCommand: (command) => {
        if (command === 'psql') migrationCalls += 1;
        return { status: command === 'psql' && migrationCalls === 2 ? 1 : 0 };
      },
    }),
    /failed at 20261017000100_platform_user_management\.sql; only a disposable local database was targeted/,
  );
  assert.equal(migrationCalls, 2);
});

test('fails when the clean replay is missing an expected feature relation', async () => {
  let commandCalled = 0;
  await assert.rejects(
    validateMigrationChain({
      migrationDirectory: 'C:\\migrations',
      auditSql,
      migrationFiles: ['20261016000100_identity_foundation.sql'],
      environment,
      runCommand: (_command, args) => {
        if (args.includes('--command')) {
          commandCalled += 1;
          const relations = Object.fromEntries(expectedRelations.map((name) => [name, true]));
          relations.learning_classrooms = false;
          return { status: 0, stdout: JSON.stringify({ relations }) };
        }
        return { status: 0 };
      },
    }),
    /missing relations: learning_classrooms/,
  );
  assert.equal(commandCalled, 1);
});

test('rejects non-local database targets before running commands', async () => {
  let commandCalled = false;
  await assert.rejects(
    validateMigrationChain({
      migrationDirectory: 'C:\\migrations',
      migrationFiles: ['20261016000100_identity_foundation.sql'],
      environment: { ...environment, PGHOST: 'remote.example.com' },
      runCommand: () => {
        commandCalled = true;
        return { status: 0 };
      },
    }),
    /restricted to the clean disposable Supabase database/,
  );
  assert.equal(commandCalled, false);
});

test('rejects the restored Staging clone as a migration replay target', async () => {
  let commandCalled = false;
  await assert.rejects(
    validateMigrationChain({
      migrationDirectory: 'C:\\migrations',
      migrationFiles: ['20261016000100_identity_foundation.sql'],
      environment: { ...environment, PGDATABASE: 'backup_restore_validation' },
      runCommand: () => {
        commandCalled = true;
        return { status: 0 };
      },
    }),
    /restricted to the clean disposable Supabase database/,
  );
  assert.equal(commandCalled, false);
});
