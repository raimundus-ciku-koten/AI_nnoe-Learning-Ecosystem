import {
  dekripsiBerkasDrive,
  enkripsiBerkasDrive,
} from './driveEncryption.js';

const SCHEMA_VERSION = 1;
const MAX_PAYLOAD_BYTES = 64 * 1024;
const SYNTHETIC_ID = /^synthetic-[a-z0-9][a-z0-9-]{0,62}$/;
const DOCUMENT_KINDS = new Set(['planning-package', 'preferences']);
const DOCUMENT_FIELDS = [
  'createdAt',
  'kind',
  'ownerHandle',
  'payload',
  'recordId',
  'revision',
  'schemaVersion',
  'updatedAt',
];

export function validasiIdMigrasiSintetis(value) {
  if (typeof value !== 'string' || !SYNTHETIC_ID.test(value)) {
    throw new TypeError('ID fixture migrasi sintetis tidak valid.');
  }
  return value;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isIsoTimestamp(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function canonicalJson(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value) || isPlainObject(value)) {
    if (ancestors.has(value)) throw new TypeError('Fixture sintetis tidak boleh memiliki referensi melingkar.');
    ancestors.add(value);
    try {
      if (Array.isArray(value)) {
        return `[${value.map((item) => canonicalJson(item, ancestors)).join(',')}]`;
      }
      return `{${Object.keys(value).sort().map((key) =>
        `${JSON.stringify(key)}:${canonicalJson(value[key], ancestors)}`).join(',')}}`;
    } finally {
      ancestors.delete(value);
    }
  }
  throw new TypeError('Fixture sintetis hanya boleh berisi nilai JSON.');
}

function requireSyntheticPayload(value, ancestors = new Set()) {
  if (typeof value === 'string') {
    if (!value.startsWith('synthetic:')) {
      throw new TypeError('Teks fixture harus diawali "synthetic:".');
    }
    return;
  }
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value) || isPlainObject(value)) {
    if (ancestors.has(value)) throw new TypeError('Fixture sintetis tidak boleh memiliki referensi melingkar.');
    ancestors.add(value);
    try {
      Object.values(value).forEach((item) => requireSyntheticPayload(item, ancestors));
    } finally {
      ancestors.delete(value);
    }
    return;
  }
  throw new TypeError('Fixture sintetis hanya boleh berisi nilai JSON.');
}

export function validasiDokumenMigrasiSintetis(document) {
  if (!isPlainObject(document) ||
      Object.keys(document).sort().join(',') !== [...DOCUMENT_FIELDS].sort().join(',') ||
      document.schemaVersion !== SCHEMA_VERSION ||
      !SYNTHETIC_ID.test(document.recordId || '') ||
      !SYNTHETIC_ID.test(document.ownerHandle || '') ||
      !DOCUMENT_KINDS.has(document.kind) ||
      !Number.isInteger(document.revision) || document.revision < 1 ||
      !isIsoTimestamp(document.createdAt) ||
      !isIsoTimestamp(document.updatedAt) ||
      Date.parse(document.createdAt) > Date.parse(document.updatedAt) ||
      !isPlainObject(document.payload)) {
    throw new TypeError('Dokumen migrasi sintetis tidak valid.');
  }
  requireSyntheticPayload(document.payload);
  if (new TextEncoder().encode(canonicalJson(document.payload)).length > MAX_PAYLOAD_BYTES) {
    throw new RangeError('Fixture sintetis melebihi batas payload 64 KiB.');
  }
  return document;
}

function requireIdentity(identity) {
  if (!identity?.privateKey || identity.privateKey.type !== 'private' ||
      typeof identity.publicKey !== 'string' ||
      !/^[a-f0-9]{64}$/.test(identity.fingerprint || '') ||
      !Number.isInteger(identity.keyVersion) || identity.keyVersion < 1) {
    throw new TypeError('Identitas enkripsi fixture sintetis tidak valid.');
  }
}

function validateEncryptedRecord(record) {
  if (!isPlainObject(record) ||
      Object.keys(record).sort().join(',') !==
        'createdAt,encrypted,kind,ownerHandle,recordId,revision,schemaVersion,updatedAt' ||
      record.schemaVersion !== SCHEMA_VERSION ||
      !SYNTHETIC_ID.test(record.recordId || '') ||
      !SYNTHETIC_ID.test(record.ownerHandle || '') ||
      !DOCUMENT_KINDS.has(record.kind) ||
      !Number.isInteger(record.revision) || record.revision < 1 ||
      !isIsoTimestamp(record.createdAt) ||
      !isIsoTimestamp(record.updatedAt) ||
      Date.parse(record.createdAt) > Date.parse(record.updatedAt) ||
      !isPlainObject(record.encrypted) ||
      Object.keys(record.encrypted).sort().join(',') !==
        'ciphertext,ciphertextSha256,ciphertextSizeBytes,iv,keyEnvelope,version' ||
      record.encrypted.version !== SCHEMA_VERSION ||
      !(record.encrypted.ciphertext instanceof Uint8Array) ||
      record.encrypted.ciphertext.length < 1 ||
      record.encrypted.ciphertext.length > MAX_PAYLOAD_BYTES + 4096 ||
      !/^[a-f0-9]{64}$/.test(record.encrypted.ciphertextSha256 || '') ||
      record.encrypted.ciphertextSizeBytes !== record.encrypted.ciphertext.length ||
      typeof record.encrypted.iv !== 'string' ||
      !isPlainObject(record.encrypted.keyEnvelope) ||
      Object.keys(record.encrypted.keyEnvelope).sort().join(',') !==
        'keyVersion,recipientKeyFingerprint,userId,wrappedDataKey' ||
      record.encrypted.keyEnvelope.userId !== record.ownerHandle) {
    throw new TypeError('Paket terenkripsi sintetis tidak valid.');
  }
  if (!Number.isInteger(record.encrypted.keyEnvelope.keyVersion) ||
      record.encrypted.keyEnvelope.keyVersion < 1 ||
      !/^[a-f0-9]{64}$/.test(record.encrypted.keyEnvelope.recipientKeyFingerprint || '') ||
      typeof record.encrypted.keyEnvelope.wrappedDataKey !== 'string' ||
      !/^[A-Za-z0-9_-]+$/.test(record.encrypted.keyEnvelope.wrappedDataKey)) {
    throw new TypeError('Envelope kunci fixture sintetis tidak valid.');
  }
  return record;
}

export function validasiPaketTerenkripsiMigrasiSintetis(record) {
  return validateEncryptedRecord(record);
}

export async function enkripsiDokumenMigrasiSintetis(document, identity) {
  validasiDokumenMigrasiSintetis(document);
  requireIdentity(identity);
  const plaintext = new TextEncoder().encode(canonicalJson(document));
  let encrypted;
  try {
    encrypted = await enkripsiBerkasDrive({
      name: `${document.recordId}.json`,
      mimeType: 'application/json',
      bytes: plaintext,
    }, document.ownerHandle, [{
      userId: document.ownerHandle,
      publicKey: identity.publicKey,
      fingerprint: identity.fingerprint,
      keyVersion: identity.keyVersion,
    }]);
  } finally {
    plaintext.fill(0);
  }
  return validateEncryptedRecord({
    schemaVersion: SCHEMA_VERSION,
    recordId: document.recordId,
    ownerHandle: document.ownerHandle,
    kind: document.kind,
    revision: document.revision,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    encrypted: {
      version: encrypted.version,
      ciphertext: encrypted.ciphertext,
      ciphertextSha256: encrypted.ciphertextSha256,
      ciphertextSizeBytes: encrypted.ciphertextSizeBytes,
      iv: encrypted.iv,
      keyEnvelope: encrypted.keyEnvelopes[0],
    },
  });
}

export async function dekripsiDokumenMigrasiSintetis(record, identity) {
  validateEncryptedRecord(record);
  requireIdentity(identity);
  const file = await dekripsiBerkasDrive({
    version: record.encrypted.version,
    ciphertext: record.encrypted.ciphertext,
    ciphertextSha256: record.encrypted.ciphertextSha256,
    iv: record.encrypted.iv,
  }, record.encrypted.keyEnvelope, identity);
  try {
    if (file.name !== `${record.recordId}.json` || file.mimeType !== 'application/json') {
      throw new Error('Metadata fixture sintetis tidak sesuai dengan manifest.');
    }
    let document;
    try {
      document = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(file.bytes));
    } catch (cause) {
      throw new Error('Isi fixture sintetis terenkripsi tidak valid.', { cause });
    }
    validasiDokumenMigrasiSintetis(document);
    if (document.recordId !== record.recordId ||
        document.ownerHandle !== record.ownerHandle ||
        document.kind !== record.kind ||
        document.revision !== record.revision ||
        document.createdAt !== record.createdAt ||
        document.updatedAt !== record.updatedAt) {
      throw new Error('Isi fixture sintetis tidak sesuai dengan manifest terenkripsi.');
    }
    return document;
  } finally {
    file.bytes.fill(0);
  }
}

export async function buatReceiptMigrasiSintetis({
  batchId,
  sourceDocuments,
  encryptedRecords,
  identity,
  completedAt,
}) {
  if (!SYNTHETIC_ID.test(batchId || '') || !isIsoTimestamp(completedAt) ||
      !Array.isArray(sourceDocuments) || !Array.isArray(encryptedRecords) ||
      sourceDocuments.length < 1 ||
      sourceDocuments.length > 1000 ||
      sourceDocuments.length !== encryptedRecords.length ||
      !identity) {
    throw new TypeError('Bahan receipt migrasi sintetis tidak lengkap atau tidak valid.');
  }
  requireIdentity(identity);
  const sources = new Map(sourceDocuments.map((document) => {
    validasiDokumenMigrasiSintetis(document);
    return [document.recordId, document];
  }));
  const targets = new Map(encryptedRecords.map((record) => {
    validateEncryptedRecord(record);
    return [record.recordId, record];
  }));
  const verifiedDocuments = await Promise.all(encryptedRecords.map((record) =>
    dekripsiDokumenMigrasiSintetis(record, identity)));
  const verified = new Map(verifiedDocuments.map((document) =>
    [document.recordId, document]));
  if (sources.size !== sourceDocuments.length ||
      targets.size !== encryptedRecords.length ||
      verified.size !== encryptedRecords.length ||
      sources.size !== targets.size ||
      sources.size !== verified.size) {
    throw new Error('Migrasi sintetis memiliki ID duplikat atau jumlah record berbeda.');
  }

  const entries = [...sources.keys()].sort().map((recordId) => {
    const source = sources.get(recordId);
    const target = targets.get(recordId);
    const roundTrip = verified.get(recordId);
    if (!target || !roundTrip ||
        source.ownerHandle !== target.ownerHandle ||
        source.kind !== target.kind ||
        source.revision !== target.revision ||
        canonicalJson(source) !== canonicalJson(roundTrip)) {
      throw new Error(`Verifikasi migrasi fixture ${recordId} gagal.`);
    }
    return {
      recordId,
      revision: source.revision,
      ciphertextSha256: target.encrypted.ciphertextSha256,
      status: 'verified',
    };
  });

  return {
    schemaVersion: SCHEMA_VERSION,
    batchId,
    completedAt,
    sourceCount: entries.length,
    targetCount: targets.size,
    verifiedCount: entries.length,
    entries,
  };
}

export function deteksiKonflikSintetis(localRecord, remoteRecord) {
  validateEncryptedRecord(localRecord);
  validateEncryptedRecord(remoteRecord);
  if (localRecord.recordId !== remoteRecord.recordId ||
      localRecord.ownerHandle !== remoteRecord.ownerHandle) {
    throw new TypeError('Perbandingan konflik harus memakai record dan pemilik sintetis yang sama.');
  }
  if (localRecord.revision === remoteRecord.revision &&
      localRecord.kind === remoteRecord.kind &&
      localRecord.createdAt === remoteRecord.createdAt &&
      localRecord.updatedAt === remoteRecord.updatedAt &&
      localRecord.encrypted.ciphertextSha256 === remoteRecord.encrypted.ciphertextSha256) {
    return { status: 'in-sync', localRecord, remoteRecord };
  }
  return { status: 'conflict', localRecord, remoteRecord };
}

export async function selesaikanKonflikSintetis(conflict, choice, resolvedAt, identity) {
  if (!conflict || conflict.status !== 'conflict' ||
      !['local', 'remote'].includes(choice) ||
      !isIsoTimestamp(resolvedAt)) {
    throw new TypeError('Pilihan resolusi konflik sintetis tidak valid.');
  }
  const selected = choice === 'local' ? conflict.localRecord : conflict.remoteRecord;
  const other = choice === 'local' ? conflict.remoteRecord : conflict.localRecord;
  validateEncryptedRecord(selected);
  validateEncryptedRecord(other);
  requireIdentity(identity);
  if (selected.recordId !== other.recordId ||
      selected.ownerHandle !== other.ownerHandle ||
      Date.parse(resolvedAt) < Math.max(
        Date.parse(selected.updatedAt),
        Date.parse(other.updatedAt),
      )) {
    throw new Error('Resolusi konflik tidak boleh menghapus cabang atau memundurkan waktu perubahan.');
  }
  const selectedDocument = await dekripsiDokumenMigrasiSintetis(selected, identity);
  const resolvedDocument = validasiDokumenMigrasiSintetis({
    ...selectedDocument,
    revision: Math.max(selected.revision, other.revision) + 1,
    updatedAt: resolvedAt,
  });
  return {
    resolvedRecord: await enkripsiDokumenMigrasiSintetis(resolvedDocument, identity),
    preservedBranches: {
      localRecord: conflict.localRecord,
      remoteRecord: conflict.remoteRecord,
    },
  };
}
