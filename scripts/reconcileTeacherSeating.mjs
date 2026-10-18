import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const UUID_NAMESPACE = '2455be91-2525-5d89-9d98-fc20e8d0b40f';
const SEATING_FIELDS = [
  'kelas',
  'baris',
  'kolom',
  'kursi',
  'kelompok',
  'jumlahKelompok',
  'diperbarui',
];

const isUuid = value =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const isValidIsoTimestamp = value =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
  Number.isFinite(Date.parse(value));

const isPlainObject = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const indexBy = (items, getKey) => {
  const index = new Map();
  for (const item of items) {
    const key = getKey(item);
    if (!key) continue;
    const values = index.get(key) ?? [];
    values.push(item);
    index.set(key, values);
  }
  return index;
};

const sourceKeyFor = (ownerUid, documentId) => `${ownerUid}/${documentId}`;

const deterministicUuid = sourceKey => {
  const namespace = Buffer.from(UUID_NAMESPACE.replaceAll('-', ''), 'hex');
  const digest = createHash('sha1')
    .update(namespace)
    .update(sourceKey, 'utf8')
    .digest()
    .subarray(0, 16);
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const validateInput = input => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Input must be a JSON object.');
  }
  for (const field of [
    'seatingPlans',
    'profiles',
    'targetTenants',
    'encryptedDriveFiles',
    'targetDriveFiles',
  ]) {
    if (!Array.isArray(input[field])) {
      throw new TypeError(`Input field "${field}" must be an array.`);
    }
  }
  if (!isValidIsoTimestamp(input.reconciledAt)) {
    throw new TypeError('Input field "reconciledAt" must be an ISO timestamp.');
  }
  return input;
};

const validateSeating = entry => {
  const data = entry.data;
  if (!isPlainObject(data)) return 'source_seating_data_invalid';
  if (Object.keys(data).sort().join(',') !== [...SEATING_FIELDS].sort().join(',')) {
    return 'source_seating_fields_invalid';
  }
  if (
    typeof data.kelas !== 'string' ||
    data.kelas.length < 1 ||
    data.kelas.length > 30 ||
    !Number.isInteger(data.baris) ||
    data.baris < 1 ||
    data.baris > 10 ||
    !Number.isInteger(data.kolom) ||
    data.kolom < 1 ||
    data.kolom > 10 ||
    !isPlainObject(data.kursi) ||
    Object.keys(data.kursi).length > 100 ||
    !isPlainObject(data.kelompok) ||
    Object.keys(data.kelompok).length > 100 ||
    !Number.isInteger(data.jumlahKelompok) ||
    data.jumlahKelompok < 2 ||
    data.jumlahKelompok > 10 ||
    !isValidIsoTimestamp(data.diperbarui)
  ) {
    return 'source_seating_fields_invalid';
  }
  return null;
};

const validateOwnerEnvelope = (encryptedFile, ownerId) =>
  Array.isArray(encryptedFile.recipients) &&
  encryptedFile.recipients.length === 1 &&
  encryptedFile.recipients[0]?.userId === ownerId &&
  encryptedFile.recipients[0]?.accessLevel === 'write' &&
  /^[a-f0-9]{64}$/.test(encryptedFile.recipients[0]?.keyFingerprint || '') &&
  Number.isInteger(encryptedFile.recipients[0]?.keyVersion) &&
  encryptedFile.recipients[0].keyVersion > 0 &&
  encryptedFile.recipients[0].keyVersion <= 32767 &&
  typeof encryptedFile.recipients[0]?.wrappedDataKey === 'string' &&
  encryptedFile.recipients[0].wrappedDataKey.length >= 64 &&
  encryptedFile.recipients[0].wrappedDataKey.length <= 4096 &&
  encryptedFile.recipients[0]?.drivePermissionVerified === false;

const validEncryptedFile = (file, ownerId) =>
  file.ownerId === ownerId &&
  typeof file.driveFileId === 'string' &&
  /^[A-Za-z0-9_-]{1,256}$/.test(file.driveFileId) &&
  typeof file.ciphertextSha256 === 'string' &&
  /^[a-f0-9]{64}$/.test(file.ciphertextSha256) &&
  Number.isInteger(file.ciphertextSizeBytes) &&
  file.ciphertextSizeBytes >= 1 &&
  file.ciphertextSizeBytes <= 10489856 &&
  Number.isInteger(file.encryptionVersion) &&
  file.encryptionVersion >= 1 &&
  file.encryptionVersion <= 32767 &&
  validateOwnerEnvelope(file, ownerId);

const sameTargetFile = (existing, proposal) =>
  existing.owner_id === proposal.owner_id &&
  existing.tenant_id === proposal.tenant_id &&
  existing.drive_file_id === proposal.drive_file_id &&
  existing.category === proposal.category &&
  existing.ciphertext_sha256 === proposal.ciphertext_sha256 &&
  existing.ciphertext_size_bytes === proposal.ciphertext_size_bytes &&
  existing.encryption_version === proposal.encryption_version &&
  isValidIsoTimestamp(existing.created_at) &&
  isValidIsoTimestamp(existing.updated_at) &&
  Date.parse(existing.updated_at) === Date.parse(proposal.updated_at) &&
  existing.revoked_at == null;

export function reconcileTeacherSeating(input) {
  const {
    seatingPlans,
    profiles,
    targetTenants,
    encryptedDriveFiles,
    targetDriveFiles,
    reconciledAt,
  } = validateInput(input);
  const sourceByKey = indexBy(seatingPlans, entry =>
    typeof entry?.ownerUid === 'string' && typeof entry?.documentId === 'string'
      ? sourceKeyFor(entry.ownerUid.trim(), entry.documentId.trim())
      : null,
  );
  const profilesByLegacyUid = indexBy(profiles, profile => profile?.legacy_uid);
  const tenantsById = indexBy(targetTenants, tenant => tenant?.id);
  const encryptedFilesBySourceKey = indexBy(encryptedDriveFiles, file => file?.sourceKey);
  const targetFilesByOwnerDriveId = indexBy(
    targetDriveFiles,
    file => `${file?.owner_id}/${file?.drive_file_id}`,
  );
  const proposals = [];
  const alreadyPresent = [];
  const quarantined = [];
  const quarantine = reason => quarantined.push({ reason });

  for (const entry of seatingPlans) {
    const sourceOwnerUid = typeof entry?.ownerUid === 'string' ? entry.ownerUid.trim() : '';
    const documentId = typeof entry?.documentId === 'string' ? entry.documentId.trim() : '';
    if (
      !sourceOwnerUid ||
      !documentId ||
      documentId.includes('/') ||
      documentId.length > 256
    ) {
      quarantine('source_path_or_document_id_invalid');
      continue;
    }
    const sourceKey = sourceKeyFor(sourceOwnerUid, documentId);
    if ((sourceByKey.get(sourceKey) ?? []).length !== 1) {
      quarantine('source_seating_not_unique');
      continue;
    }
    const invalidSeating = validateSeating(entry);
    if (invalidSeating) {
      quarantine(invalidSeating);
      continue;
    }

    const ownerMatches = profilesByLegacyUid.get(sourceOwnerUid) ?? [];
    if (ownerMatches.length !== 1) {
      quarantine('owner_legacy_uid_not_unique');
      continue;
    }
    const owner = ownerMatches[0];
    if (
      !isUuid(owner.id) ||
      owner.active !== true ||
      !['admin_sekolah', 'operator', 'guru', 'demo'].includes(owner.role) ||
      typeof owner.tenant_id !== 'string' ||
      !owner.tenant_id
    ) {
      quarantine('owner_profile_not_verified');
      continue;
    }
    const tenantMatches = tenantsById.get(owner.tenant_id) ?? [];
    if (tenantMatches.length !== 1 || tenantMatches[0].active !== true) {
      quarantine('active_target_tenant_not_verified');
      continue;
    }

    const encryptedMatches = encryptedFilesBySourceKey.get(sourceKey) ?? [];
    if (encryptedMatches.length !== 1) {
      quarantine('encrypted_drive_file_missing_or_ambiguous');
      continue;
    }
    const encryptedFile = encryptedMatches[0];
    if (!validEncryptedFile(encryptedFile, owner.id)) {
      quarantine('owner_encrypted_drive_file_metadata_invalid');
      continue;
    }

    const proposal = {
      id: deterministicUuid(sourceKey),
      owner_id: owner.id,
      tenant_id: owner.tenant_id,
      drive_file_id: encryptedFile.driveFileId,
      category: 'other',
      ciphertext_sha256: encryptedFile.ciphertextSha256,
      ciphertext_size_bytes: encryptedFile.ciphertextSizeBytes,
      encryption_version: encryptedFile.encryptionVersion,
      created_at: new Date(reconciledAt).toISOString(),
      updated_at: new Date(entry.data.diperbarui).toISOString(),
      revoked_at: null,
    };
    const targetMatches = targetFilesByOwnerDriveId.get(
      `${proposal.owner_id}/${proposal.drive_file_id}`,
    ) ?? [];
    if (targetMatches.length > 1) {
      quarantine('target_drive_file_not_unique');
      continue;
    }
    if (targetMatches.length === 1) {
      if (sameTargetFile(targetMatches[0], proposal)) {
        alreadyPresent.push(proposal.id);
      } else {
        quarantine('target_drive_file_metadata_conflict');
      }
      continue;
    }
    proposals.push(proposal);
  }

  return {
    mode: 'report-only',
    summary: {
      sourceSeatingPlans: seatingPlans.length,
      profiles: profiles.length,
      targetTenants: targetTenants.length,
      encryptedDriveFiles: encryptedDriveFiles.length,
      targetDriveFiles: targetDriveFiles.length,
      proposals: proposals.length,
      alreadyPresent: alreadyPresent.length,
      quarantined: quarantined.length,
    },
    proposals,
    alreadyPresent,
    quarantined,
  };
}

async function runCli(argv) {
  const inputPath = argv[2];
  if (!inputPath || argv.length !== 3) {
    throw new Error('Usage: node scripts/reconcileTeacherSeating.mjs <local-minimal-input.json>');
  }
  const report = reconcileTeacherSeating(JSON.parse(await readFile(inputPath, 'utf8')));
  process.stdout.write(`${JSON.stringify({
    mode: report.mode,
    summary: report.summary,
    quarantineReasons: report.quarantined.reduce((counts, item) => {
      counts[item.reason] = (counts[item.reason] ?? 0) + 1;
      return counts;
    }, {}),
  }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
