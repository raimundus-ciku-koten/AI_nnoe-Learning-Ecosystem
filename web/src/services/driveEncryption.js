const VERSION = 1;
const RSA_ALGORITHM = { name: 'RSA-OAEP', modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
const BACKUP_INFO = new TextEncoder().encode('ainnoe-drive-private-key-v1');
const FILE_AAD = new TextEncoder().encode('ainnoe-drive-file-v1');
const MAX_FILE_SIZE = 10 * 1024 * 1024;
let identitySession = null;

function cryptoApi() {
  if (!globalThis.crypto?.subtle || typeof globalThis.crypto.getRandomValues !== 'function') {
    throw new Error('Enkripsi Drive memerlukan browser dengan Web Crypto API pada koneksi aman.');
  }
  return globalThis.crypto;
}

function toBase64Url(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new TypeError(`${label} tidak valid.`);
  }
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function acak(length) {
  return cryptoApi().getRandomValues(new Uint8Array(length));
}

function aadCadangan(publicKey, fingerprint) {
  return new TextEncoder().encode(`${VERSION}:${fingerprint}:${publicKey}`);
}

async function sidikJari(publicKeyBytes) {
  const digest = new Uint8Array(await cryptoApi().subtle.digest('SHA-256', publicKeyBytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function kunciPemulihan(recoveryCode, salt) {
  const recoveryBytes = fromBase64Url(recoveryCode, 'Kode pemulihan');
  if (recoveryBytes.length !== 32) throw new TypeError('Kode pemulihan tidak valid.');
  const material = await cryptoApi().subtle.importKey('raw', recoveryBytes, 'HKDF', false, ['deriveKey']);
  return cryptoApi().subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: BACKUP_INFO },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function importPublicKey(publicKey) {
  const bytes = fromBase64Url(publicKey, 'Kunci publik penerima');
  const imported = await cryptoApi().subtle.importKey(
    'spki',
    bytes,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  );
  if (imported.algorithm.modulusLength !== 3072 ||
      imported.algorithm.hash.name !== 'SHA-256') {
    throw new TypeError('Kunci publik harus RSA-OAEP 3072-bit dengan SHA-256.');
  }
  return { bytes, imported, fingerprint: await sidikJari(bytes) };
}

export async function buatIdentitasEnkripsiDrive() {
  const crypto = cryptoApi();
  const pair = await crypto.subtle.generateKey(RSA_ALGORITHM, true, ['encrypt', 'decrypt']);
  const [publicKeyBytes, privateKeyBytes] = await Promise.all([
    crypto.subtle.exportKey('spki', pair.publicKey),
    crypto.subtle.exportKey('pkcs8', pair.privateKey),
  ]);
  const publicKey = toBase64Url(new Uint8Array(publicKeyBytes));
  const fingerprint = await sidikJari(new Uint8Array(publicKeyBytes));
  const recoveryCode = toBase64Url(acak(32));
  const salt = acak(32);
  const iv = acak(12);
  try {
    const wrappingKey = await kunciPemulihan(recoveryCode, salt);
    const encryptedPrivateKey = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: aadCadangan(publicKey, fingerprint) },
      wrappingKey,
      privateKeyBytes,
    );
    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      privateKeyBytes,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['decrypt'],
    );

    return {
      privateKey,
      publicKey,
      fingerprint,
      keyVersion: VERSION,
      recoveryCode,
      encryptedPrivateKeyBackup: {
        version: VERSION,
        algorithm: 'RSA-OAEP-3072-SHA256',
        kdf: 'HKDF-SHA256',
        publicKey,
        fingerprint,
        salt: toBase64Url(salt),
        iv: toBase64Url(iv),
        ciphertext: toBase64Url(new Uint8Array(encryptedPrivateKey)),
      },
    };
  } finally {
    new Uint8Array(privateKeyBytes).fill(0);
  }
}

export function simpanIdentitasEnkripsiDriveDalamSesi(userId, identity) {
  if (typeof userId !== 'string' || !userId.trim() ||
      !identity?.privateKey || identity.privateKey.type !== 'private' ||
      typeof identity.publicKey !== 'string' ||
      !/^[a-f0-9]{64}$/.test(identity.fingerprint || '') ||
      !Number.isInteger(identity.keyVersion) || identity.keyVersion < 1) {
    throw new TypeError('Identitas enkripsi sesi tidak valid.');
  }
  identitySession = {
    userId,
    identity: {
      privateKey: identity.privateKey,
      publicKey: identity.publicKey,
      fingerprint: identity.fingerprint,
      keyVersion: identity.keyVersion,
    },
  };
}

export function identitasEnkripsiDriveDalamSesi(userId) {
  return identitySession && identitySession.userId === userId ? identitySession.identity : null;
}

export function hapusIdentitasEnkripsiDriveDalamSesi(userId) {
  if (!userId || identitySession?.userId === userId) identitySession = null;
}

export async function pulihkanIdentitasEnkripsiDrive(backup, recoveryCode) {
  if (!backup || backup.version !== VERSION ||
      backup.algorithm !== 'RSA-OAEP-3072-SHA256' ||
      backup.kdf !== 'HKDF-SHA256') {
    throw new TypeError('Format cadangan kunci enkripsi tidak didukung.');
  }

  const salt = fromBase64Url(backup.salt, 'Salt cadangan');
  const iv = fromBase64Url(backup.iv, 'Nonce cadangan');
  const ciphertext = fromBase64Url(backup.ciphertext, 'Cadangan kunci privat');
  if (salt.length !== 32 || iv.length !== 12 || ciphertext.length < 32) {
    throw new TypeError('Cadangan kunci enkripsi tidak valid.');
  }

  const wrappingKey = await kunciPemulihan(recoveryCode, salt);
  let privateKeyBytes;
  try {
    privateKeyBytes = await cryptoApi().subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: aadCadangan(backup.publicKey, backup.fingerprint) },
      wrappingKey,
      ciphertext,
    );
  } catch (cause) {
    throw new Error('Kode pemulihan salah atau cadangan kunci telah berubah.', { cause });
  }

  try {
    const publicKey = await importPublicKey(backup.publicKey);
    if (publicKey.fingerprint !== backup.fingerprint) {
      throw new Error('Sidik jari kunci publik tidak sesuai dengan cadangan.');
    }

    const privateKey = await cryptoApi().subtle.importKey(
      'pkcs8',
      privateKeyBytes,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['decrypt'],
    );
    if (privateKey.algorithm.modulusLength !== 3072 ||
        privateKey.algorithm.hash.name !== 'SHA-256') {
      throw new TypeError('Kunci privat harus RSA-OAEP 3072-bit dengan SHA-256.');
    }
    return {
      privateKey,
      publicKey: backup.publicKey,
      fingerprint: backup.fingerprint,
      keyVersion: VERSION,
    };
  } finally {
    new Uint8Array(privateKeyBytes).fill(0);
  }
}

export async function enkripsiBerkasDrive(berkas, ownerId, recipients) {
  if (!berkas || !(berkas.bytes instanceof Uint8Array) ||
      typeof berkas.name !== 'string' || !berkas.name.trim() ||
      berkas.name.length > 255 ||
      typeof berkas.mimeType !== 'string' || berkas.mimeType.length > 255 ||
      berkas.bytes.length === 0 || berkas.bytes.length > MAX_FILE_SIZE) {
    throw new TypeError('Berkas tidak valid atau melebihi batas 10 MB.');
  }
  if (typeof ownerId !== 'string' || !ownerId.trim()) {
    throw new TypeError('Pemilik berkas terenkripsi tidak valid.');
  }
  if (!Array.isArray(recipients) || recipients.length < 1 || recipients.length > 100) {
    throw new TypeError('Tentukan 1–100 penerima kunci berkas.');
  }
  if (!recipients.some((recipient) => recipient?.userId === ownerId)) {
    throw new TypeError('Pemilik berkas wajib menerima kunci dekripsi.');
  }

  const seen = new Set();
  const importedRecipients = await Promise.all(recipients.map(async (recipient) => {
    if (!recipient || typeof recipient.userId !== 'string' || !recipient.userId.trim() ||
        seen.has(recipient.userId) || !Number.isInteger(recipient.keyVersion) ||
        recipient.keyVersion < 1 || recipient.keyVersion > 32767) {
      throw new TypeError('Identitas penerima kunci berkas tidak valid atau duplikat.');
    }
    seen.add(recipient.userId);
    const key = await importPublicKey(recipient.publicKey);
    if (key.fingerprint !== recipient.fingerprint) {
      throw new Error(`Sidik jari kunci penerima ${recipient.userId} tidak sesuai.`);
    }
    return { ...recipient, key };
  }));

  const metadata = new TextEncoder().encode(JSON.stringify({
    name: berkas.name,
    mimeType: berkas.mimeType,
    lastModified: Number.isFinite(berkas.lastModified) ? berkas.lastModified : null,
  }));
  const plaintext = new Uint8Array(4 + metadata.length + berkas.bytes.length);
  new DataView(plaintext.buffer).setUint32(0, metadata.length);
  plaintext.set(metadata, 4);
  plaintext.set(berkas.bytes, 4 + metadata.length);

  const crypto = cryptoApi();
  const rawDataKey = acak(32);
  let iv;
  let ciphertext;
  let keyEnvelopes;
  let ciphertextSha256;
  try {
    const dataKey = await crypto.subtle.importKey('raw', rawDataKey, 'AES-GCM', false, ['encrypt']);
    iv = acak(12);
    ciphertext = new Uint8Array(await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: FILE_AAD },
      dataKey,
      plaintext,
    ));
    keyEnvelopes = await Promise.all(importedRecipients.map(async (recipient) => {
      const wrapped = await crypto.subtle.encrypt(
        { name: 'RSA-OAEP' },
        recipient.key.imported,
        rawDataKey,
      );
      return {
        userId: recipient.userId,
        wrappedDataKey: toBase64Url(new Uint8Array(wrapped)),
        recipientKeyFingerprint: recipient.key.fingerprint,
        keyVersion: recipient.keyVersion,
      };
    }));
    ciphertextSha256 = await sidikJari(ciphertext);
  } finally {
    rawDataKey.fill(0);
    plaintext.fill(0);
  }

  return {
    version: VERSION,
    ciphertext,
    iv: toBase64Url(iv),
    ciphertextSha256,
    ciphertextSizeBytes: ciphertext.length,
    keyEnvelopes,
  };
}

export async function dekripsiBerkasDrive(encrypted, keyEnvelope, privateKey) {
  if (!encrypted || encrypted.version !== VERSION ||
      !(encrypted.ciphertext instanceof Uint8Array) ||
      typeof keyEnvelope?.wrappedDataKey !== 'string' ||
      !privateKey?.privateKey || privateKey.privateKey.type !== 'private' ||
      typeof privateKey.fingerprint !== 'string' ||
      keyEnvelope.recipientKeyFingerprint !== privateKey.fingerprint ||
      keyEnvelope.keyVersion !== privateKey.keyVersion) {
    throw new TypeError('Berkas terenkripsi atau kunci penerima tidak valid.');
  }
  const expectedHash = await sidikJari(encrypted.ciphertext);
  if (expectedHash !== encrypted.ciphertextSha256) {
    throw new Error('Checksum berkas terenkripsi tidak sesuai.');
  }

  const wrappedDataKey = fromBase64Url(keyEnvelope.wrappedDataKey, 'Kunci data berkas');
  let rawDataKey;
  try {
    rawDataKey = await cryptoApi().subtle.decrypt({ name: 'RSA-OAEP' }, privateKey.privateKey, wrappedDataKey);
  } catch (cause) {
    throw new Error('Kunci privat ini tidak dapat membuka kunci berkas.', { cause });
  }

  const crypto = cryptoApi();
  let dataKey;
  try {
    dataKey = await crypto.subtle.importKey('raw', rawDataKey, 'AES-GCM', false, ['decrypt']);
  } finally {
    new Uint8Array(rawDataKey).fill(0);
  }
  let plaintext;
  try {
    plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: fromBase64Url(encrypted.iv, 'Nonce berkas'),
        additionalData: FILE_AAD,
      },
      dataKey,
      encrypted.ciphertext,
    );
  } catch (cause) {
    throw new Error('Berkas tidak dapat didekripsi; data mungkin telah diubah.', { cause });
  }

  const bytes = new Uint8Array(plaintext);
  if (bytes.length < 5) {
    bytes.fill(0);
    throw new Error('Isi berkas terenkripsi tidak valid.');
  }
  const metadataSize = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  if (metadataSize === 0 || metadataSize > bytes.length - 4) {
    bytes.fill(0);
    throw new Error('Metadata berkas terenkripsi tidak valid.');
  }
  let metadata;
  try {
    metadata = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(4, 4 + metadataSize)));
  } catch (cause) {
    bytes.fill(0);
    throw new Error('Metadata berkas terenkripsi tidak dapat dibaca.', { cause });
  }
  if (typeof metadata.name !== 'string' || typeof metadata.mimeType !== 'string') {
    bytes.fill(0);
    throw new Error('Metadata berkas terenkripsi tidak valid.');
  }

  const fileBytes = bytes.slice(4 + metadataSize);
  bytes.fill(0);
  return { ...metadata, bytes: fileBytes };
}

export function eksporCadanganKunciDrive(backup) {
  return new Blob([JSON.stringify(backup)], { type: 'application/vnd.ainnoe.encrypted-key+json' });
}
