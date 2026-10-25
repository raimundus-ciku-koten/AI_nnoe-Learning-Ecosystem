import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { decryptBackup, encryptBackup } from './encryptedBackup.mjs';

const temporary = () => mkdtemp(resolve(tmpdir(), 'ale-backup-test-'));

test('encrypted backup round-trips arbitrary dump bytes', async () => {
  const directory = await temporary();
  const key = randomBytes(32).toString('base64');
  const original = randomBytes(1024 * 64 + 3);
  const source = resolve(directory, 'dump.sql');
  const encrypted = resolve(directory, 'dump.aeb');
  const restored = resolve(directory, 'restored.sql');

  try {
    await writeFile(source, original);
    await encryptBackup(source, encrypted, key);
    assert.notDeepEqual(await readFile(encrypted), original);
    await decryptBackup(encrypted, restored, key);
    assert.deepEqual(await readFile(restored), original);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('encrypted backup rejects an incorrect key and never leaves plaintext output', async () => {
  const directory = await temporary();
  const source = resolve(directory, 'dump.sql');
  const encrypted = resolve(directory, 'dump.aeb');
  const restored = resolve(directory, 'restored.sql');

  try {
    await writeFile(source, 'student data');
    await encryptBackup(source, encrypted, randomBytes(32).toString('base64'));
    await assert.rejects(
      decryptBackup(encrypted, restored, randomBytes(32).toString('base64')),
    );
    await assert.rejects(readFile(restored), { code: 'ENOENT' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('encrypted backup detects tampering and malformed keys', async () => {
  const directory = await temporary();
  const key = randomBytes(32).toString('base64');
  const source = resolve(directory, 'dump.sql');
  const encrypted = resolve(directory, 'dump.aeb');

  try {
    await writeFile(source, 'database contents');
    await encryptBackup(source, encrypted, key);
    const bytes = await readFile(encrypted);
    bytes[bytes.length - 20] ^= 0xff;
    await writeFile(encrypted, bytes);
    await assert.rejects(decryptBackup(encrypted, resolve(directory, 'restored.sql'), key));
    await assert.rejects(encryptBackup(source, resolve(directory, 'invalid.aeb'), 'invalid-key'), /32 byte/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('encrypted backup refuses empty dump files', async () => {
  const directory = await temporary();
  try {
    await writeFile(resolve(directory, 'empty.dump'), '');
    await assert.rejects(
      encryptBackup(
        resolve(directory, 'empty.dump'),
        resolve(directory, 'empty.aeb'),
        randomBytes(32).toString('base64'),
      ),
      /kosong/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('limits encrypted database backups to manually triggered Staging artifacts', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/supabase-backup.yml', import.meta.url),
    'utf8',
  );
  const targetValidator = await readFile(
    new URL('./validateStagingBackupTarget.mjs', import.meta.url),
    'utf8',
  );
  const validate = workflow.match(
    /      - name: Validate backup configuration([\s\S]*?)(?=      - name:|$)/,
  )?.[1];
  const create = workflow.match(
    /      - name: Create and encrypt database dump([\s\S]*?)(?=      - name:|$)/,
  )?.[1];
  const upload = workflow.match(
    /      - name: Upload encrypted backup artifact([\s\S]*?)(?=      - name:|$)/,
  )?.[1];
  const download = workflow.match(
    /      - name: Download encrypted backup artifact([\s\S]*?)(?=      - name:|$)/,
  )?.[1];
  const restore = workflow.match(
    /      - name: Decrypt and restore uploaded artifact to disposable database([\s\S]*?)(?=      - name:|$)/,
  )?.[1];

  assert.doesNotMatch(workflow, /^    env:/m);
  assert.doesNotMatch(workflow, /^  schedule:/m);
  assert.doesNotMatch(workflow, /Cloudflare R2|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY/);
  assert.ok(validate);
  assert.ok(create);
  assert.ok(upload);
  assert.ok(download);
  assert.ok(restore);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /Run this workflow from main only/);
  assert.match(validate, /validateStagingBackupTarget\.mjs/);
  assert.match(targetValidator, /samszhfyhbjuculrcffg/);
  assert.match(targetValidator, /sessionPoolerStaging/);
  assert.match(workflow, /Install PostgreSQL 17 client/);
  assert.match(workflow, /postgresql-client-17/);
  assert.match(
    workflow,
    /image: supabase\/postgres:17\.11\.0\.007@sha256:b0463b9ab930a3535478d529b915d37def49d5a8fb0cb1927929e96af992b519/,
  );
  assert.match(workflow, /POSTGRES_USER: supabase_admin/);
  assert.match(workflow, /POSTGRES_PASSWORD: restore-validation-only/);
  assert.match(workflow, /5432:5432/);
  assert.match(create, /\/usr\/lib\/postgresql\/17\/bin\/pg_dump --format=custom/);
  assert.match(create, /\/usr\/lib\/postgresql\/17\/bin\/pg_restore --list "\$dump" > \/dev\/null/);
  assert.match(create, /node scripts\/encryptedBackup\.mjs encrypt "\$dump" "\$encrypted"/);
  assert.doesNotMatch(create, /createdb|pg_restore \\\r?\n\s+--exit-on-error/);
  assert.doesNotMatch(create, /export PGPASSWORD=/);
  assert.match(create, /test -s "\$dump"/);
  assert.match(create, /test -s "\$encrypted"/);
  assert.match(create, /400 \* 1024 \* 1024/);
  assert.match(validate, /SUPABASE_DB_URL:/);
  assert.match(validate, /BACKUP_ENCRYPTION_KEY:/);
  assert.match(create, /SUPABASE_DB_URL:/);
  assert.match(create, /BACKUP_ENCRYPTION_KEY:/);
  assert.match(upload, /actions\/upload-artifact@v4/);
  assert.match(download, /actions\/download-artifact@v4/);
  assert.match(download, /supabase-staging-encrypted-\$\{\{ github\.run_id \}\}/);
  assert.match(upload, /retention-days: 1/);
  assert.match(upload, /compression-level: 0/);
  assert.match(upload, /if-no-files-found: error/);
  assert.doesNotMatch(upload, /SUPABASE_DB_URL:/);
  assert.doesNotMatch(upload, /BACKUP_ENCRYPTION_KEY:/);
  assert.ok(
    workflow.indexOf('- name: Upload encrypted backup artifact') <
      workflow.indexOf('- name: Download encrypted backup artifact'),
  );
  assert.ok(
    workflow.indexOf('- name: Download encrypted backup artifact') <
      workflow.indexOf('- name: Decrypt and restore uploaded artifact to disposable database'),
  );
  assert.match(restore, /node scripts\/encryptedBackup\.mjs decrypt "\$artifact" "\$restored_dump"/);
  assert.match(restore, /cmp --silent "\$dump" "\$restored_dump"/);
  assert.match(restore, /--exit-on-error --no-owner --no-acl/);
  assert.match(restore, /--dbname "\$restore_db" "\$restored_dump"/);
  assert.match(restore, /pg_catalog\.pg_tables/);
  assert.match(restore, /Encrypted artifact restore completed without any user tables/);
  assert.match(restore, /BACKUP_ENCRYPTION_KEY:/);
  assert.doesNotMatch(restore, /SUPABASE_DB_URL:/);
});
