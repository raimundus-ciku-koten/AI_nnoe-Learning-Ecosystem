import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const workflow = await readFile(
  new URL('../.github/workflows/supabase-staging-migration-rehearsal.yml', import.meta.url),
  'utf8',
);

test('migration rehearsal is manual, main-only, and pinned to the Staging project', () => {
  assert.match(workflow, /^\s*workflow_dispatch:/m);
  assert.match(workflow, /GITHUB_REF.*refs\/heads\/main/);
  assert.match(workflow, /validateStagingBackupTarget\.mjs/);
  assert.match(workflow, /SUPABASE_DB_URL: \$\{\{ secrets\.SUPABASE_DB_URL \}\}/);
  assert.match(
    workflow,
    /image: supabase\/postgres:17\.11\.0\.007@sha256:b0463b9ab930a3535478d529b915d37def49d5a8fb0cb1927929e96af992b519/,
  );
});

test('only a disposable restore receives the release migrations', () => {
  assert.match(workflow, /pg_dump[\s\S]*--format=custom/);
  assert.match(workflow, /pg_restore[\s\S]*--dbname "\$restore_db" "\$dump"/);
  assert.match(workflow, /max_dump_size=\$\(\(400 \* 1024 \* 1024\)\)/);
  assert.match(workflow, /--single-transaction/);
  assert.match(workflow, /--set=VERBOSITY=sqlstate/);
  assert.match(workflow, /SQLSTATE \$\{error_code\}/);
  assert.match(workflow, /--dbname "\$restore_db"[\s\S]*--file "\$migration"/);
  assert.match(workflow, /No hosted schema was changed/);
  assert.match(workflow, /does not authorize or perform a hosted migration/);
  assert.doesNotMatch(workflow, /\bsupabase db push\b|\bdb reset\b/i);
});

test('release-excluded billing and public trial migrations are never replayed', () => {
  assert.match(workflow, /20261018000400_midtrans_billing\.sql/);
  assert.match(workflow, /20261019000100_indonesia_price_catalog\.sql/);
  assert.match(workflow, /20261019000200_public_demo_trial\.sql/);
  assert.match(workflow, /20261018001200_multi_role_identity\.sql/);
  assert.match(workflow, /20261017001500_chat_presence\.sql/);
});

test('snapshot, restore, and database error output are not uploaded or printed', () => {
  assert.match(workflow, /error_log="\$\{RUNNER_TEMP\}\/supabase-staging-rehearsal/);
  assert.match(workflow, /database output was withheld/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /rm -f "\$\{RUNNER_TEMP\}\/supabase-staging-rehearsal-\$\{GITHUB_RUN_ID\}\.dump"/);
  assert.doesNotMatch(workflow, /actions\/upload-artifact/);
  assert.doesNotMatch(workflow, /cat "\$error_log"|tee .*error_log/);
});
