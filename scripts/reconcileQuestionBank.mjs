import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const QUESTION_FIELDS = [
  'ownerUid',
  'mapel',
  'kelas',
  'jenis',
  'pertanyaan',
  'pilihan',
  'jawaban',
  'pembahasan',
  'createdAt',
  'updatedAt',
];

const isText = (value, maxLength, { allowEmpty = false } = {}) =>
  typeof value === 'string' &&
  value.length <= maxLength &&
  (allowEmpty || value.length > 0);

const isUuid = value =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const isValidIsoTimestamp = value =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
  Number.isFinite(Date.parse(value));

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

const sourceKeyFor = (tenantId, documentId) => `${tenantId}/${documentId}`;

const validateInput = input => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Input must be a JSON object.');
  }
  for (const field of [
    'questionBankEntries',
    'profiles',
    'targetTenants',
    'encryptedDriveFiles',
    'targetDriveFiles',
  ]) {
    if (!Array.isArray(input[field])) {
      throw new TypeError(`Input field "${field}" must be an array.`);
    }
  }
  if (
    !input.tenantCrosswalk ||
    typeof input.tenantCrosswalk !== 'object' ||
    Array.isArray(input.tenantCrosswalk)
  ) {
    throw new TypeError('Input field "tenantCrosswalk" must be a verified mapping object.');
  }
  return input;
};

const validateQuestion = data => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'source_document_data_invalid';
  if (
    Object.keys(data).sort().join(',') !== [...QUESTION_FIELDS].sort().join(',') ||
    !isText(data.ownerUid, 128) ||
    !isText(data.mapel, 80) ||
    !isText(data.kelas, 30) ||
    !['pilihan_ganda', 'uraian'].includes(data.jenis) ||
    !isText(data.pertanyaan, 2000) ||
    !Array.isArray(data.pilihan) ||
    !isText(data.jawaban, 1000) ||
    !isText(data.pembahasan, 2000, { allowEmpty: true }) ||
    !isValidIsoTimestamp(data.createdAt) ||
    !isValidIsoTimestamp(data.updatedAt) ||
    Date.parse(data.createdAt) > Date.parse(data.updatedAt)
  ) {
    return 'source_question_fields_invalid';
  }
  if (data.pilihan.some(choice => !isText(choice, 300))) {
    return 'source_question_choices_invalid';
  }
  if (
    (data.jenis === 'uraian' && data.pilihan.length !== 0) ||
    (data.jenis === 'pilihan_ganda' &&
      (data.pilihan.length < 2 || data.pilihan.length > 5 || !data.pilihan.includes(data.jawaban)))
  ) {
    return 'source_question_choices_invalid';
  }
  return null;
};

const sameTargetFile = (existing, proposal) =>
  existing.owner_id === proposal.owner_id &&
  existing.tenant_id === proposal.tenant_id &&
  existing.category === proposal.category &&
  existing.ciphertext_sha256 === proposal.ciphertext_sha256 &&
  existing.ciphertext_size_bytes === proposal.ciphertext_size_bytes &&
  existing.encryption_version === proposal.encryption_version &&
  existing.created_at &&
  Date.parse(existing.created_at) === Date.parse(proposal.created_at) &&
  existing.updated_at &&
  Date.parse(existing.updated_at) === Date.parse(proposal.updated_at) &&
  existing.revoked_at == null;

export function reconcileQuestionBank(input) {
  const {
    questionBankEntries,
    profiles,
    targetTenants,
    encryptedDriveFiles,
    targetDriveFiles,
    tenantCrosswalk,
  } = validateInput(input);

  const sourceByKey = indexBy(questionBankEntries, entry =>
    typeof entry?.tenantId === 'string' && typeof entry?.documentId === 'string'
      ? sourceKeyFor(entry.tenantId.trim(), entry.documentId.trim())
      : null,
  );
  const profileByLegacyUid = indexBy(profiles, profile => profile?.legacy_uid);
  const targetsById = indexBy(targetTenants, tenant => tenant?.id);
  const filesBySourceKey = indexBy(encryptedDriveFiles, file => file?.sourceKey);
  const targetFilesByOwnerAndDriveId = indexBy(
    targetDriveFiles,
    file => `${file?.owner_id}/${file?.drive_file_id}`,
  );
  const crosswalkTargets = indexBy(
    Object.entries(tenantCrosswalk).map(([sourceId, targetId]) => ({ sourceId, targetId })),
    entry => entry.targetId,
  );
  const quarantined = [];
  const proposals = [];
  const alreadyPresent = [];
  const quarantine = reason => quarantined.push({ reason });

  for (const entry of questionBankEntries) {
    const sourceTenantId = typeof entry?.tenantId === 'string' ? entry.tenantId.trim() : '';
    const sourceDocumentId = typeof entry?.documentId === 'string' ? entry.documentId.trim() : '';
    if (!sourceTenantId || !sourceDocumentId) {
      quarantine('source_path_or_document_id_missing');
      continue;
    }
    const sourceKey = sourceKeyFor(sourceTenantId, sourceDocumentId);
    if ((sourceByKey.get(sourceKey) ?? []).length !== 1) {
      quarantine('source_document_id_not_unique');
      continue;
    }

    const invalidReason = validateQuestion(entry.data);
    if (invalidReason) {
      quarantine(invalidReason);
      continue;
    }

    const targetTenantId = tenantCrosswalk[sourceTenantId];
    if (typeof targetTenantId !== 'string' || !targetTenantId.trim()) {
      quarantine('verified_tenant_crosswalk_missing');
      continue;
    }
    if ((crosswalkTargets.get(targetTenantId) ?? []).length !== 1) {
      quarantine('tenant_crosswalk_target_not_unique');
      continue;
    }
    const tenantMatches = targetsById.get(targetTenantId) ?? [];
    if (tenantMatches.length !== 1 || tenantMatches[0].active !== true) {
      quarantine('active_target_tenant_not_verified');
      continue;
    }

    const ownerMatches = profileByLegacyUid.get(entry.data.ownerUid) ?? [];
    if (ownerMatches.length !== 1) {
      quarantine('owner_legacy_uid_not_unique');
      continue;
    }
    const owner = ownerMatches[0];
    if (
      !isUuid(owner.id) ||
      owner.active !== true ||
      owner.role !== 'guru' ||
      owner.tenant_id !== targetTenantId
    ) {
      quarantine('owner_profile_not_verified_for_tenant');
      continue;
    }

    const encryptedMatches = filesBySourceKey.get(sourceKey) ?? [];
    if (encryptedMatches.length !== 1) {
      quarantine('encrypted_drive_file_missing_or_ambiguous');
      continue;
    }
    const encryptedFile = encryptedMatches[0];
    if (
      typeof encryptedFile.driveFileId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,256}$/.test(encryptedFile.driveFileId) ||
      typeof encryptedFile.ciphertextSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(encryptedFile.ciphertextSha256) ||
      !Number.isInteger(encryptedFile.ciphertextSizeBytes) ||
      encryptedFile.ciphertextSizeBytes < 1 ||
      encryptedFile.ciphertextSizeBytes > 10489856 ||
      !Number.isInteger(encryptedFile.encryptionVersion) ||
      encryptedFile.encryptionVersion < 1 ||
      encryptedFile.encryptionVersion > 32767
    ) {
      quarantine('encrypted_drive_file_metadata_invalid');
      continue;
    }

    const proposal = {
      owner_id: owner.id,
      tenant_id: targetTenantId,
      drive_file_id: encryptedFile.driveFileId,
      category: 'assessment',
      ciphertext_sha256: encryptedFile.ciphertextSha256,
      ciphertext_size_bytes: encryptedFile.ciphertextSizeBytes,
      encryption_version: encryptedFile.encryptionVersion,
      created_at: new Date(entry.data.createdAt).toISOString(),
      updated_at: new Date(entry.data.updatedAt).toISOString(),
      revoked_at: null,
    };
    const targetKey = `${proposal.owner_id}/${proposal.drive_file_id}`;
    const existingMatches = targetFilesByOwnerAndDriveId.get(targetKey) ?? [];
    if (existingMatches.length > 1) {
      quarantine('target_drive_file_not_unique');
    } else if (existingMatches.length === 1) {
      if (sameTargetFile(existingMatches[0], proposal)) {
        alreadyPresent.push({
          owner_id: proposal.owner_id,
          drive_file_id: proposal.drive_file_id,
        });
      } else {
        quarantine('target_drive_file_metadata_conflict');
      }
    } else {
      proposals.push(proposal);
    }
  }

  return {
    mode: 'report-only',
    summary: {
      sourceEntries: questionBankEntries.length,
      profiles: profiles.length,
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
    throw new Error('Usage: node scripts/reconcileQuestionBank.mjs <local-minimal-input.json>');
  }
  const report = reconcileQuestionBank(JSON.parse(await readFile(inputPath, 'utf8')));
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
