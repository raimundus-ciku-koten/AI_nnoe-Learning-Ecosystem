import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buatIdentitasEnkripsiDrive,
  dekripsiBerkasDrive,
  enkripsiBerkasDrive,
  hapusIdentitasEnkripsiDriveDalamSesi,
  identitasEnkripsiDriveDalamSesi,
  pulihkanIdentitasEnkripsiDrive,
  simpanIdentitasEnkripsiDriveDalamSesi,
} from '../src/services/driveEncryption.js';

const owner = await buatIdentitasEnkripsiDrive();
const recipient = await buatIdentitasEnkripsiDrive();
const payload = new TextEncoder().encode('dokumen akademik rahasia');
const encrypted = await enkripsiBerkasDrive({
  name: 'nilai-semester.json',
  mimeType: 'application/json',
  lastModified: 1234,
  bytes: payload,
}, 'owner-id', [
  {
    userId: 'owner-id',
    publicKey: owner.publicKey,
    fingerprint: owner.fingerprint,
    keyVersion: owner.keyVersion,
  },
  {
    userId: 'recipient-id',
    publicKey: recipient.publicKey,
    fingerprint: recipient.fingerprint,
    keyVersion: recipient.keyVersion,
  },
]);

test('membuat cadangan kunci privat terenkripsi dan memulihkannya dengan kode pemulihan', async () => {
  assert.equal(owner.encryptedPrivateKeyBackup.algorithm, 'RSA-OAEP-3072-SHA256');
  assert.equal(owner.encryptedPrivateKeyBackup.kdf, 'HKDF-SHA256');
  assert.equal(JSON.stringify(owner.encryptedPrivateKeyBackup).includes(owner.recoveryCode), false);

  const restored = await pulihkanIdentitasEnkripsiDrive(
    owner.encryptedPrivateKeyBackup,
    owner.recoveryCode,
  );
  assert.equal(restored.fingerprint, owner.fingerprint);
  assert.equal(restored.keyVersion, owner.keyVersion);
  await assert.rejects(
    pulihkanIdentitasEnkripsiDrive(owner.encryptedPrivateKeyBackup, recipient.recoveryCode),
    /Kode pemulihan salah/,
  );
});

test('menyimpan kunci privat minimal di memori sesi dan mengikatnya ke akun', () => {
  const userId = 'workspace-session-owner';
  simpanIdentitasEnkripsiDriveDalamSesi(userId, owner);
  const cached = identitasEnkripsiDriveDalamSesi(userId);
  assert.equal(cached.privateKey, owner.privateKey);
  assert.equal(cached.fingerprint, owner.fingerprint);
  assert.equal(identitasEnkripsiDriveDalamSesi('other-user'), null);
  assert.equal('recoveryCode' in cached, false);
  assert.equal('encryptedPrivateKeyBackup' in cached, false);
  hapusIdentitasEnkripsiDriveDalamSesi(userId);
  assert.equal(identitasEnkripsiDriveDalamSesi(userId), null);
});

test('mengenkripsi isi dan metadata lalu membukanya hanya dengan kunci privat penerima', async () => {
  assert.equal(encrypted.keyEnvelopes.length, 2);
  assert.equal(encrypted.ciphertextSha256.length, 64);
  assert.equal(Buffer.from(encrypted.ciphertext).includes(Buffer.from(payload)), false);

  const recipientFile = await dekripsiBerkasDrive(
    encrypted,
    encrypted.keyEnvelopes[1],
    recipient,
  );
  assert.deepEqual(recipientFile.bytes, payload);
  assert.equal(recipientFile.name, 'nilai-semester.json');
  assert.equal(recipientFile.mimeType, 'application/json');
  assert.equal(recipientFile.lastModified, 1234);

  const ownerFile = await dekripsiBerkasDrive(encrypted, encrypted.keyEnvelopes[0], owner);
  assert.deepEqual(ownerFile.bytes, payload);
  await assert.rejects(
    dekripsiBerkasDrive(encrypted, encrypted.keyEnvelopes[1], owner),
    /tidak valid/,
  );
});

test('mendeteksi perubahan ciphertext, penerima duplikat, dan kunci publik yang dipalsukan', async () => {
  const modified = { ...encrypted, ciphertext: encrypted.ciphertext.slice() };
  modified.ciphertext[0] ^= 1;
  await assert.rejects(
    dekripsiBerkasDrive(modified, encrypted.keyEnvelopes[0], owner),
    /Checksum/,
  );

  await assert.rejects(enkripsiBerkasDrive({
    name: 'data.bin',
    mimeType: 'application/octet-stream',
    bytes: new Uint8Array([1]),
  }, 'owner-id', [
    { userId: 'owner-id', publicKey: owner.publicKey, fingerprint: owner.fingerprint, keyVersion: 1 },
    { userId: 'owner-id', publicKey: recipient.publicKey, fingerprint: recipient.fingerprint, keyVersion: 1 },
  ]), /duplikat/);
  await assert.rejects(enkripsiBerkasDrive({
    name: 'data.bin',
    mimeType: 'application/octet-stream',
    bytes: new Uint8Array([1]),
  }, 'owner-id', [
    { userId: 'recipient-id', publicKey: recipient.publicKey, fingerprint: recipient.fingerprint, keyVersion: 1 },
  ]), /wajib menerima/);

  await assert.rejects(pulihkanIdentitasEnkripsiDrive(
    { ...owner.encryptedPrivateKeyBackup, publicKey: recipient.publicKey },
    owner.recoveryCode,
  ), /Kode pemulihan salah/);
});

test('menolak file yang melewati batas ukuran sebelum enkripsi', async () => {
  await assert.rejects(enkripsiBerkasDrive({
    name: 'terlalu-besar.bin',
    mimeType: 'application/octet-stream',
    bytes: new Uint8Array(10 * 1024 * 1024 + 1),
  }, 'owner-id', [{
    userId: 'owner-id',
    publicKey: owner.publicKey,
    fingerprint: owner.fingerprint,
    keyVersion: owner.keyVersion,
  }]), /batas 10 MB/);
});
