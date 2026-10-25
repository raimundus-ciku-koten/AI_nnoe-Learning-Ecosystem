import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getOrderedMigrationFiles,
  validateMigrationChain,
} from './validateMigrationChain.mjs';

const environment = {
  PGHOST: '127.0.0.1',
  PGPORT: '5432',
  PGUSER: 'supabase_admin',
  PGDATABASE: 'backup_restore_validation',
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

test('executes each migration in its own transaction against the restored disposable clone', async () => {
  const calls = [];
  const result = await validateMigrationChain({
    migrationDirectory: 'C:\\migrations',
    migrationFiles: [
      '20261017000100_platform_user_management.sql',
      '20261016000100_identity_foundation.sql',
    ],
    environment,
    runCommand: (command, args, options) => {
      calls.push({ command, args, options });
      return { status: 0 };
    },
  });

  assert.match(result, /Validated 2 migrations/);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.command === 'psql'));
  assert.ok(calls[0].args.includes('--single-transaction'));
  assert.match(calls[0].args.at(-1), /20261016000100_identity_foundation\.sql$/);
  assert.equal(calls[0].options.env.PGDATABASE, 'backup_restore_validation');
  assert.equal('SUPABASE_DB_URL' in calls[0].options.env, false);
  assert.equal('BACKUP_ENCRYPTION_KEY' in calls[0].options.env, false);
});

test('stops at the first failed migration without echoing connection details', async () => {
  let migrationCalls = 0;
  await assert.rejects(
    validateMigrationChain({
      migrationDirectory: 'C:\\migrations',
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
    /failed at 20261017000100_platform_user_management\.sql/,
  );
  assert.equal(migrationCalls, 2);
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
    /restricted to the disposable restored Staging clone/,
  );
  assert.equal(commandCalled, false);
});
