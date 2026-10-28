import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('migration rehearsal is manual, main-only, and checks out the approved immutable source', async () => {
  const workflow = await read('../.github/workflows/supabase-staging-migration-rehearsal.yml');

  assert.match(workflow, /^  workflow_dispatch:$/m);
  assert.match(workflow, /Run this workflow from main only/);
  assert.match(workflow, /GITHUB_REF" != "refs\/heads\/main"/);
  assert.match(workflow, /ref: 3990f7cf858dce45d4fb64de7b4220749686707a/);
  assert.match(workflow, /path: migration-source/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /migration-source\/supabase\/migrations/);
});

test('migration rehearsal validates Staging and replays only into a disposable local restore', async () => {
  const workflow = await read('../.github/workflows/supabase-staging-migration-rehearsal.yml');
  const targetValidator = await read('./validateStagingBackupTarget.mjs');
  const restore = workflow.match(
    /      - name: Restore a fresh Staging snapshot to the disposable database([\s\S]*?)(?=      - name:|$)/,
  )?.[1];
  const replay = workflow.match(
    /      - name: Replay in-scope migrations on the disposable restore([\s\S]*?)(?=      - name:|$)/,
  )?.[1];

  assert.ok(restore);
  assert.ok(replay);
  assert.match(workflow, /node scripts\/validateStagingBackupTarget\.mjs/);
  assert.match(targetValidator, /samszhfyhbjuculrcffg/);
  assert.match(targetValidator, /sessionPoolerStaging/);
  assert.match(workflow, /--format=custom --no-owner --no-acl/);
  assert.match(restore, /pg_dump/);
  assert.match(restore, /--host 127\.0\.0\.1/);
  assert.match(restore, /pg_restore/);
  assert.match(replay, /--host 127\.0\.0\.1/);
  assert.match(replay, /--single-transaction/);
  assert.match(replay, /No hosted schema was changed/);
  assert.match(replay, /20261018000400_midtrans_billing\.sql/);
  assert.match(replay, /20261019000100_indonesia_price_catalog\.sql/);
  assert.match(replay, /20261019000200_public_demo_trial\.sql/);
  assert.match(workflow, /Remove temporary database files/);
  assert.doesNotMatch(workflow, /upload-artifact|SUPABASE_DB_URL[\s\S]{0,80}psql/);
});
