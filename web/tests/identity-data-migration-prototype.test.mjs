import assert from 'node:assert/strict';
import { test } from 'node:test';
import 'fake-indexeddb/auto';
import {
  buatIdentitasEnkripsiDrive,
  pulihkanIdentitasEnkripsiDrive,
} from '../src/services/driveEncryption.js';
import {
  buatReceiptMigrasiSintetis,
  dekripsiDokumenMigrasiSintetis,
  deteksiKonflikSintetis,
  enkripsiDokumenMigrasiSintetis,
  selesaikanKonflikSintetis,
  validasiPaketTerenkripsiMigrasiSintetis,
  validasiDokumenMigrasiSintetis,
} from '../src/services/identityDataMigrationPrototype.js';
import {
  ambilPaketMigrasiSintetisLokal,
  daftarPaketMigrasiSintetisLokal,
  hapusPaketMigrasiSintetisLokal,
  simpanPaketMigrasiSintetisLokal,
} from '../src/services/identityDataMigrationIndexedDbPrototype.js';

const ownerHandle = 'synthetic-account-0001';
const createdAt = '2026-01-15T08:00:00.000Z';

function document(recordId = 'synthetic-record-0001', revision = 1, updatedAt = createdAt) {
  return {
    schemaVersion: 1,
    recordId,
    ownerHandle,
    kind: 'planning-package',
    revision,
    createdAt,
    updatedAt,
    payload: {
      title: 'synthetic:rencana-pelajaran',
      meetings: 2,
      labels: ['synthetic:semester-ganjil'],
    },
  };
}

const identity = await buatIdentitasEnkripsiDrive();

test('hanya menerima kontrak berversi dan payload fixture sintetis', () => {
  assert.equal(validasiDokumenMigrasiSintetis(document()).recordId, 'synthetic-record-0001');
  assert.throws(
    () => validasiDokumenMigrasiSintetis({ ...document(), recordId: 'real-user-record' }),
    /tidak valid/,
  );
  assert.throws(
    () => validasiDokumenMigrasiSintetis({
      ...document(),
      payload: { title: 'Nama pengguna sebenarnya' },
    }),
    /diawali "synthetic:"/,
  );
  assert.throws(
    () => validasiDokumenMigrasiSintetis({ ...document(), schemaVersion: 2 }),
    /tidak valid/,
  );
});

test('mengenkripsi dan memulihkan fixture hanya melalui kunci pemilik', async () => {
  const source = document();
  const encrypted = await enkripsiDokumenMigrasiSintetis(source, identity);
  assert.equal(encrypted.encrypted.keyEnvelope.userId, ownerHandle);
  assert.equal(encrypted.encrypted.ciphertextSha256.length, 64);
  assert.equal(Buffer.from(encrypted.encrypted.ciphertext).includes(
    Buffer.from('synthetic:rencana-pelajaran'),
  ), false);
  assert.deepEqual(await dekripsiDokumenMigrasiSintetis(encrypted, identity), source);

  const otherIdentity = await buatIdentitasEnkripsiDrive();
  await assert.rejects(
    dekripsiDokumenMigrasiSintetis(encrypted, otherIdentity),
    /tidak valid/,
  );
});

test('menolak ciphertext yang berubah dan memulihkan kunci dengan recovery code', async () => {
  const encrypted = await enkripsiDokumenMigrasiSintetis(document(), identity);
  const modified = {
    ...encrypted,
    encrypted: {
      ...encrypted.encrypted,
      ciphertext: encrypted.encrypted.ciphertext.slice(),
    },
  };
  modified.encrypted.ciphertext[0] ^= 1;
  await assert.rejects(
    dekripsiDokumenMigrasiSintetis(modified, identity),
    /Checksum/,
  );

  const restoredIdentity = await pulihkanIdentitasEnkripsiDrive(
    identity.encryptedPrivateKeyBackup,
    identity.recoveryCode,
  );
  assert.deepEqual(await dekripsiDokumenMigrasiSintetis(encrypted, restoredIdentity), document());
  const wrongIdentity = await buatIdentitasEnkripsiDrive();
  await assert.rejects(
    pulihkanIdentitasEnkripsiDrive(identity.encryptedPrivateKeyBackup, wrongIdentity.recoveryCode),
    /Kode pemulihan salah/,
  );
});

test('receipt hanya menyatakan migrasi terverifikasi jika semua record sama', async () => {
  const source = [document(), document('synthetic-record-0002')];
  const encrypted = await Promise.all(source.map((record) =>
    enkripsiDokumenMigrasiSintetis(record, identity)));
  const receipt = await buatReceiptMigrasiSintetis({
    batchId: 'synthetic-batch-0001',
    sourceDocuments: source,
    encryptedRecords: encrypted,
    identity,
    completedAt: '2026-01-15T08:05:00.000Z',
  });

  assert.deepEqual({
    sourceCount: receipt.sourceCount,
    targetCount: receipt.targetCount,
    verifiedCount: receipt.verifiedCount,
  }, { sourceCount: 2, targetCount: 2, verifiedCount: 2 });
  assert.ok(receipt.entries.every((entry) => entry.status === 'verified'));
  assert.equal(JSON.stringify(receipt).includes('synthetic:rencana-pelajaran'), false);
  await assert.rejects(buatReceiptMigrasiSintetis({
    batchId: 'synthetic-batch-0002',
    sourceDocuments: source,
    encryptedRecords: [encrypted[0]],
    identity,
    completedAt: '2026-01-15T08:05:00.000Z',
  }), /tidak lengkap atau tidak valid/);
  const forgedRecord = {
    ...encrypted[1],
    encrypted: {
      ...encrypted[1].encrypted,
      keyEnvelope: {
        ...encrypted[1].encrypted.keyEnvelope,
        userId: 'synthetic-account-0002',
      },
    },
  };
  await assert.rejects(buatReceiptMigrasiSintetis({
    batchId: 'synthetic-batch-0003',
    sourceDocuments: source,
    encryptedRecords: [encrypted[0], forgedRecord],
    identity,
    completedAt: '2026-01-15T08:05:00.000Z',
  }), /Paket terenkripsi sintetis tidak valid/);
});

test('konflik mempertahankan kedua cabang dan membuat revisi baru tanpa merge otomatis', async () => {
  const localDocument = document('synthetic-record-0003', 2, '2026-01-15T08:02:00.000Z');
  const remoteDocument = {
    ...document('synthetic-record-0003', 2, '2026-01-15T08:03:00.000Z'),
    payload: {
      title: 'synthetic:rencana-versi-remote',
      meetings: 3,
      labels: ['synthetic:semester-ganjil'],
    },
  };
  const [local, remote] = await Promise.all([
    enkripsiDokumenMigrasiSintetis(localDocument, identity),
    enkripsiDokumenMigrasiSintetis(remoteDocument, identity),
  ]);
  const conflict = deteksiKonflikSintetis(local, remote);
  assert.equal(conflict.status, 'conflict');
  assert.equal(conflict.localRecord, local);
  assert.equal(conflict.remoteRecord, remote);

  const { resolvedRecord, preservedBranches } = await selesaikanKonflikSintetis(
    conflict,
    'remote',
    '2026-01-15T08:04:00.000Z',
    identity,
  );
  assert.equal(resolvedRecord.revision, 3);
  assert.equal(resolvedRecord.updatedAt, '2026-01-15T08:04:00.000Z');
  assert.equal(preservedBranches.localRecord, local);
  assert.equal(preservedBranches.remoteRecord, remote);
  assert.deepEqual(await dekripsiDokumenMigrasiSintetis(resolvedRecord, identity), {
    ...remoteDocument,
    revision: 3,
    updatedAt: '2026-01-15T08:04:00.000Z',
  });
  await assert.rejects(
    selesaikanKonflikSintetis(conflict, 'remote', '2026-01-15T08:02:30.000Z', identity),
    /memundurkan waktu/,
  );
  assert.equal(deteksiKonflikSintetis(local, local).status, 'in-sync');
  assert.throws(() => deteksiKonflikSintetis(
    local,
    { ...remote, ownerHandle: 'synthetic-account-0002' },
  ), /Paket terenkripsi sintetis tidak valid/);
});

test('IndexedDB lokal menyimpan hanya paket terenkripsi dan mempertahankannya saat dibuka ulang', async () => {
  const source = document('synthetic-record-indexeddb-0001');
  const encrypted = await enkripsiDokumenMigrasiSintetis(source, identity);

  assert.equal(await simpanPaketMigrasiSintetisLokal(encrypted), source.recordId);
  const reopened = await ambilPaketMigrasiSintetisLokal(source.recordId);
  assert.deepEqual(reopened, encrypted);
  assert.deepEqual(
    await dekripsiDokumenMigrasiSintetis(reopened, identity),
    source,
  );
  assert.equal(JSON.stringify(await daftarPaketMigrasiSintetisLokal())
    .includes('synthetic:rencana-pelajaran'), false);
});

test('IndexedDB menolak plaintext/ID non-sintetis dan menghapus hanya fixture yang diminta', async () => {
  const source = document('synthetic-record-indexeddb-0002');
  const encrypted = await enkripsiDokumenMigrasiSintetis(source, identity);
  await assert.rejects(
    simpanPaketMigrasiSintetisLokal(source),
    /Paket terenkripsi sintetis tidak valid/,
  );
  await assert.rejects(
    ambilPaketMigrasiSintetisLokal('real-user-record'),
    /ID fixture migrasi sintetis tidak valid/,
  );
  assert.equal(
    validasiPaketTerenkripsiMigrasiSintetis(encrypted).recordId,
    source.recordId,
  );

  await simpanPaketMigrasiSintetisLokal(encrypted);
  await hapusPaketMigrasiSintetisLokal(source.recordId);
  assert.equal(await ambilPaketMigrasiSintetisLokal(source.recordId), undefined);
});

test('IndexedDB memberikan error yang jelas jika tidak tersedia', async () => {
  const originalIndexedDb = globalThis.indexedDB;
  globalThis.indexedDB = undefined;
  try {
    await assert.rejects(
      daftarPaketMigrasiSintetisLokal(),
      /tidak mendukung penyimpanan IndexedDB lokal/,
    );
  } finally {
    globalThis.indexedDB = originalIndexedDb;
  }
});
