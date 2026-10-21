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

test('limits backup credentials to the workflow steps that need them', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/supabase-backup.yml', import.meta.url),
    'utf8',
  );
  const validate = workflow.match(
    /      - name: Validate backup configuration([\s\S]*?)(?=      - name:|$)/,
  )?.[1];
  const create = workflow.match(
    /      - name: Create and encrypt database dump([\s\S]*?)(?=      - name:|$)/,
  )?.[1];
  const upload = workflow.match(
    /      - name: Upload encrypted backup to Cloudflare R2([\s\S]*?)$/,
  )?.[1];

  assert.doesNotMatch(workflow, /^    env:/m);
  assert.ok(validate);
  assert.ok(create);
  assert.ok(upload);
  assert.match(create, /pg_dump --format=custom/);
  assert.match(create, /pg_restore --list "\$dump" > \/dev\/null/);
  assert.match(create, /test -s "\$dump"/);
  assert.match(create, /test -s "\$encrypted"/);
  assert.match(validate, /SUPABASE_DB_URL:/);
  assert.match(validate, /BACKUP_ENCRYPTION_KEY:/);
  assert.match(validate, /AWS_SECRET_ACCESS_KEY:/);
  assert.match(create, /SUPABASE_DB_URL:/);
  assert.match(create, /BACKUP_ENCRYPTION_KEY:/);
  assert.doesNotMatch(create, /AWS_SECRET_ACCESS_KEY:/);
  assert.match(upload, /AWS_SECRET_ACCESS_KEY:/);
  assert.doesNotMatch(upload, /SUPABASE_DB_URL:/);
  assert.doesNotMatch(upload, /BACKUP_ENCRYPTION_KEY:/);
});
