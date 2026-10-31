import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  decryptBackup,
  decryptBackupStream,
  encryptBackup,
  encryptBackupStream,
} from './encryptedBackup.mjs';

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

test('encrypted backup streams round-trip bytes without a plaintext intermediate file', async () => {
  const directory = await temporary();
  const key = randomBytes(32).toString('base64');
  const original = randomBytes(1024 * 64 + 3);
  const encrypted = resolve(directory, 'dump.aeb');

  try {
    await encryptBackupStream(Readable.from([original]), encrypted, key);
    const chunks = [];
    for await (const chunk of decryptBackupStream(encrypted, key)) chunks.push(chunk);
    const restored = Buffer.concat(chunks);
    assert.deepEqual(restored, original);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('streaming encryption rejects empty input without leaving an artifact', async () => {
  const directory = await temporary();
  const encrypted = resolve(directory, 'empty.aeb');

  try {
    await assert.rejects(
      encryptBackupStream(Readable.from([]), encrypted, randomBytes(32).toString('base64')),
      /kosong/,
    );
    await assert.rejects(readFile(encrypted), { code: 'ENOENT' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('streaming backup CLI preserves binary stdin/stdout', async () => {
  const directory = await temporary();
  const key = randomBytes(32).toString('base64');
  const original = randomBytes(1024 * 32 + 7);
  const encrypted = resolve(directory, 'stream.aeb');
  const script = fileURLToPath(new URL('./encryptedBackup.mjs', import.meta.url));
  const env = { ...process.env, BACKUP_ENCRYPTION_KEY: key };

  try {
    const encrypt = spawnSync(
      process.execPath,
      [script, 'encrypt-stdin', encrypted],
      { input: original, env, encoding: null },
    );
    assert.equal(encrypt.status, 0, encrypt.stderr.toString());

    const decrypt = spawnSync(
      process.execPath,
      [script, 'decrypt-stdout', encrypted],
      { env, encoding: null, maxBuffer: original.length * 2 },
    );
    assert.equal(decrypt.error, undefined, decrypt.error?.message);
    assert.equal(decrypt.status, 0, decrypt.stderr.toString());
    assert.deepEqual(decrypt.stdout, original);
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
    /      - name: Create, encrypt, and restore database dump([\s\S]*?)(?=      - name:|$)/,
  )?.[1];
  const upload = workflow.match(
    /      - name: Upload encrypted backup artifact([\s\S]*?)(?=      - name:|$)/,
  )?.[1];
  const cleanup = workflow.match(
    /      - name: Remove temporary database files([\s\S]*?)(?=      - name:|$)/,
  )?.[1];

  assert.doesNotMatch(workflow, /^    env:/m);
  assert.doesNotMatch(workflow, /^  schedule:/m);
  assert.doesNotMatch(workflow, /Cloudflare R2|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY/);
  assert.ok(validate);
  assert.ok(create);
  assert.ok(upload);
  assert.ok(cleanup);
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
  assert.match(
    create,
    /createdb \\\r?\n\s+--host 127\.0\.0\.1 --username supabase_admin "\$restore_db"/,
  );
  assert.match(create, /--exit-on-error --no-owner --no-acl/);
  assert.match(create, /--dbname "\$restore_db" "\$dump"/);
  assert.match(create, /pg_catalog\.pg_tables/);
  assert.match(create, /Disposable restore completed without any user tables/);
  assert.ok(
    create.indexOf('pg_restore \\\n            --exit-on-error') <
      create.indexOf('node scripts/encryptedBackup.mjs encrypt'),
  );
  assert.match(create, /node scripts\/encryptedBackup\.mjs decrypt "\$encrypted" "\$encrypted_restore"/);
  assert.match(create, /pg_restore --list "\$encrypted_restore" > \/dev\/null/);
  assert.match(create, /--dbname "\$encrypted_restore_db" "\$encrypted_restore"/);
  assert.match(create, /encrypted_table_count != table_count/);
  assert.match(create, /Encrypted artifact round-trip restore validated/);
  assert.ok(
    create.indexOf('node scripts/encryptedBackup.mjs encrypt') <
      create.indexOf('node scripts/encryptedBackup.mjs decrypt'),
  );
  assert.doesNotMatch(create, /export PGPASSWORD=/);
  assert.match(create, /test -s "\$dump"/);
  assert.match(create, /test -s "\$encrypted"/);
  assert.match(create, /test -s "\$encrypted_restore"/);
  assert.match(cleanup, /supabase-staging-\$\{GITHUB_RUN_ID\}-encrypted-restore\.dump/);
  assert.match(create, /400 \* 1024 \* 1024/);
  assert.match(validate, /SUPABASE_DB_URL:/);
  assert.match(validate, /BACKUP_ENCRYPTION_KEY:/);
  assert.match(create, /SUPABASE_DB_URL:/);
  assert.match(create, /BACKUP_ENCRYPTION_KEY:/);
  assert.match(upload, /actions\/upload-artifact@v4/);
  assert.match(upload, /retention-days: 1/);
  assert.match(upload, /compression-level: 0/);
  assert.match(upload, /if-no-files-found: error/);
  assert.doesNotMatch(upload, /SUPABASE_DB_URL:/);
  assert.doesNotMatch(upload, /BACKUP_ENCRYPTION_KEY:/);
});

test('local Production backup is target-bound and does not persist plaintext dumps', async () => {
  const script = await readFile(
    new URL('./backupProductionLocal.ps1', import.meta.url),
    'utf8',
  );
  const tasks = JSON.parse(await readFile(new URL('../.vscode/tasks.json', import.meta.url), 'utf8'));

  assert.match(script, /Production = 'jvcrmzmuxgyuetkjqady'/);
  assert.match(script, /Staging = 'samszhfyhbjuculrcffg'/);
  assert.match(script, /ValidateSet\('Production', 'Staging'\)/);
  assert.match(script, /jvcrmzmuxgyuetkjqady/);
  assert.match(script, /samszhfyhbjuculrcffg/);
  assert.match(script, /PostgreSQL \$Target \(input tersembunyi\)/);
  assert.match(script, /if \(\$databasePassword -match/);
  assert.doesNotMatch(script, /\$productionPassword/);
  assert.match(script, /db\.\$projectRef\.supabase\.co/);
  assert.match(script, /postgres\.\$projectRef/);
  assert.match(script, /'encrypt-stdin'/);
  assert.match(script, /'decrypt-stdout'/);
  assert.match(script, /--tmpfs/);
  assert.match(script, /\/var\/lib\/postgresql\/data:rw,noexec,nosuid/);
  assert.match(script, /PGPASSFILE=\/run\/ale-backup\/pgpass\.conf/);
  assert.doesNotMatch(script, /--mount|--publish/);
  assert.match(script, /'exec', '--interactive'/);
  assert.match(script, /--no-password/);
  assert.doesNotMatch(script, /--file/);
  assert.match(script, /Set-PrivateAcl/);
  assert.equal(
    tasks.tasks.find((task) => task.label.includes('Production backup'))?.args.includes('-Target'),
    false,
  );
  assert.equal(tasks.tasks.find((task) => task.label.includes('Staging backup'))?.args.slice(-2).join(' '), '-Target Staging');
});
