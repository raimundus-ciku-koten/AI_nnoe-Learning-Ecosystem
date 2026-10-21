import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateStagingBackupTarget } from './validateStagingBackupTarget.mjs';

const stagingRef = 'samszhfyhbjuculrcffg';

test('allows direct and session-pooler URLs for the configured Staging project', () => {
  assert.doesNotThrow(() => validateStagingBackupTarget(
    `postgresql://postgres:encoded%40password@db.${stagingRef}.supabase.co:5432/postgres`,
  ));
  assert.doesNotThrow(() => validateStagingBackupTarget(
    `postgresql://postgres.${stagingRef}:encoded%40password@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`,
  ));
});

test('rejects Production, other projects, and non-PostgreSQL endpoints', () => {
  assert.throws(
    () => validateStagingBackupTarget(
      'postgresql://postgres:password@db.jvcrmzmuxgyuetkjqady.supabase.co:5432/postgres',
    ),
    /configured Staging database only/,
  );
  assert.throws(
    () => validateStagingBackupTarget(
      'postgresql://postgres.otherproject:password@aws-0-ap-south-1.pooler.supabase.com:5432/postgres',
    ),
    /configured Staging database only/,
  );
  assert.throws(
    () => validateStagingBackupTarget('https://example.com'),
    /configured Staging database only/,
  );
});

test('rejects malformed connection strings and missing passwords', () => {
  assert.throws(
    () => validateStagingBackupTarget('not-a-database-url'),
    /valid PostgreSQL URL/,
  );
  assert.throws(
    () => validateStagingBackupTarget(
      `postgresql://postgres@db.${stagingRef}.supabase.co:5432/postgres`,
    ),
    /configured Staging database only/,
  );
});
