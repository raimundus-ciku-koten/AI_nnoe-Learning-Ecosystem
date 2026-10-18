import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const UUID_NAMESPACE = 'e538cd47-f034-5bbb-81f9-76b3193bf771';
const MODULE_FIELDS = [
  'ownerUid',
  'tenantId',
  'paketId',
  'jenis',
  'noUnit',
  'schemaVersion',
  'rev',
  'sumber',
  'sumberRev',
  'payload',
  'createdAt',
  'updatedAt',
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

const sourceKeyFor = (tenantId, ownerUid, packageId, unitNumber) =>
  `${tenantId}/${ownerUid}/${packageId}/modul/${unitNumber}`;

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
    'planningModules',
    'parentPackages',
    'directoryEntries',
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

const validateModule = (entry, sourceOwnerUid, sourceTenantId, packageId, unitNumber) => {
  const data = entry.data;
  if (!isPlainObject(data)) return 'source_module_data_invalid';
  if (Object.keys(data).sort().join(',') !== [...MODULE_FIELDS].sort().join(',')) {
    return 'source_module_fields_invalid';
  }
  if (
    data.ownerUid !== sourceOwnerUid ||
    data.tenantId !== sourceTenantId ||
    data.paketId !== packageId ||
    data.jenis !== 'modul' ||
    !Number.isInteger(data.noUnit) ||
    data.noUnit < 1 ||
    data.noUnit > 30 ||
    String(data.noUnit) !== unitNumber ||
    data.schemaVersion !== 1 ||
    !Number.isInteger(data.rev) ||
    data.rev < 1 ||
    !['mesin', 'ai', 'manual'].includes(data.sumber) ||
    !isPlainObject(data.sumberRev) ||
    !isPlainObject(data.payload) ||
    !isValidIsoTimestamp(data.createdAt) ||
    !isValidIsoTimestamp(data.updatedAt) ||
    Date.parse(data.createdAt) > Date.parse(data.updatedAt)
  ) {
    return 'source_module_fields_invalid';
  }
  return null;
};

const expectedRecipients = (profiles, ownerId, tenantId) => {
  const recipients = new Map([[ownerId, 'write']]);
  for (const profile of profiles) {
    if (profile.active !== true || !isUuid(profile.id)) continue;
    if (
      profile.role === 'superadmin' ||
      (profile.role === 'admin_sekolah' && profile.tenant_id === tenantId)
    ) {
      recipients.set(profile.id, 'read');
    }
  }
  return recipients;
};

const validateRecipientShares = (encryptedFile, expected) => {
  if (!Array.isArray(encryptedFile.recipients) || encryptedFile.recipients.length !== expected.size) {
    return 'planning_module_recipient_shares_incomplete';
  }
  const seen = new Set();
  for (const recipient of encryptedFile.recipients) {
    if (
      !recipient ||
      typeof recipient.userId !== 'string' ||
      seen.has(recipient.userId) ||
      !expected.has(recipient.userId) ||
      recipient.accessLevel !== expected.get(recipient.userId) ||
      !/^[a-f0-9]{64}$/.test(recipient.keyFingerprint || '') ||
      !Number.isInteger(recipient.keyVersion) ||
      recipient.keyVersion < 1 ||
      recipient.keyVersion > 32767 ||
      typeof recipient.wrappedDataKey !== 'string' ||
      recipient.wrappedDataKey.length < 64 ||
      recipient.wrappedDataKey.length > 4096 ||
      (recipient.userId !== encryptedFile.ownerId && recipient.drivePermissionVerified !== true) ||
      (recipient.userId === encryptedFile.ownerId && recipient.drivePermissionVerified !== false)
    ) {
      return 'planning_module_recipient_shares_invalid';
    }
    seen.add(recipient.userId);
  }
  return null;
};

const sameTargetFile = (existing, proposal) =>
  existing.owner_id === proposal.owner_id &&
  existing.tenant_id === proposal.tenant_id &&
  existing.drive_file_id === proposal.drive_file_id &&
  existing.category === proposal.category &&
  existing.ciphertext_sha256 === proposal.ciphertext_sha256 &&
  existing.ciphertext_size_bytes === proposal.ciphertext_size_bytes &&
  existing.encryption_version === proposal.encryption_version &&
  existing.created_at &&
  Date.parse(existing.created_at) === Date.parse(proposal.created_at) &&
  existing.updated_at &&
  Date.parse(existing.updated_at) === Date.parse(proposal.updated_at) &&
  existing.revoked_at == null;

export function reconcilePlanningModules(input) {
  const {
    planningModules,
    parentPackages,
    directoryEntries,
    profiles,
    targetTenants,
    encryptedDriveFiles,
    targetDriveFiles,
    tenantCrosswalk,
  } = validateInput(input);
  const sourceByKey = indexBy(planningModules, entry =>
    typeof entry?.tenantId === 'string' &&
    typeof entry?.ownerUid === 'string' &&
    typeof entry?.packageId === 'string' &&
    typeof entry?.documentId === 'string'
      ? sourceKeyFor(
        entry.tenantId.trim(),
        entry.ownerUid.trim(),
        entry.packageId.trim(),
        entry.documentId.trim(),
      )
      : null,
  );
  const parentByKey = indexBy(parentPackages, entry =>
    typeof entry?.tenantId === 'string' &&
    typeof entry?.ownerUid === 'string' &&
    typeof entry?.packageId === 'string'
      ? `${entry.tenantId.trim()}/${entry.ownerUid.trim()}/${entry.packageId.trim()}`
      : null,
  );
  const profilesByLegacyUid = indexBy(profiles, profile => profile?.legacy_uid);
  const directoryByUid = indexBy(
    directoryEntries,
    entry => typeof entry?.documentId === 'string' ? entry.documentId.trim() : null,
  );
  const tenantsById = indexBy(targetTenants, tenant => tenant?.id);
  const filesBySourceKey = indexBy(encryptedDriveFiles, file => file?.sourceKey);
  const targetFilesByOwnerDriveId = indexBy(
    targetDriveFiles,
    file => `${file?.owner_id}/${file?.drive_file_id}`,
  );
  const crosswalkTargets = indexBy(
    Object.entries(tenantCrosswalk).map(([sourceId, targetId]) => ({ sourceId, targetId })),
    entry => typeof entry.targetId === 'string' ? entry.targetId.trim() : null,
  );
  const proposals = [];
  const alreadyPresent = [];
  const quarantined = [];
  const quarantine = reason => quarantined.push({ reason });

  for (const entry of planningModules) {
    const sourceTenantId = typeof entry?.tenantId === 'string' ? entry.tenantId.trim() : '';
    const sourceOwnerUid = typeof entry?.ownerUid === 'string' ? entry.ownerUid.trim() : '';
    const packageId = typeof entry?.packageId === 'string' ? entry.packageId.trim() : '';
    const unitNumber = typeof entry?.documentId === 'string' ? entry.documentId.trim() : '';
    if (
      !sourceTenantId ||
      !sourceOwnerUid ||
      !packageId ||
      !/^(?:[1-9]|[12][0-9]|30)$/.test(unitNumber)
    ) {
      quarantine('source_path_or_unit_number_invalid');
      continue;
    }
    const sourceKey = sourceKeyFor(sourceTenantId, sourceOwnerUid, packageId, unitNumber);
    if ((sourceByKey.get(sourceKey) ?? []).length !== 1) {
      quarantine('source_module_not_unique');
      continue;
    }
    const invalidModule = validateModule(
      entry,
      sourceOwnerUid,
      sourceTenantId,
      packageId,
      unitNumber,
    );
    if (invalidModule) {
      quarantine(invalidModule);
      continue;
    }

    const parentKey = `${sourceTenantId}/${sourceOwnerUid}/${packageId}`;
    const parentMatches = parentByKey.get(parentKey) ?? [];
    if (parentMatches.length !== 1) {
      quarantine('parent_planning_package_missing_or_ambiguous');
      continue;
    }
    const parent = parentMatches[0];
    if (
      parent.data?.ownerUid !== sourceOwnerUid ||
      parent.data?.tenantId !== sourceTenantId ||
      parent.data?.schemaVersion !== 1
    ) {
      quarantine('parent_planning_package_mismatch');
      continue;
    }

    const targetTenantId = tenantCrosswalk[sourceTenantId];
    if (typeof targetTenantId !== 'string' || !targetTenantId.trim()) {
      quarantine('verified_tenant_crosswalk_missing');
      continue;
    }
    const normalizedTenantId = targetTenantId.trim();
    if ((crosswalkTargets.get(normalizedTenantId) ?? []).length !== 1) {
      quarantine('tenant_crosswalk_target_not_unique');
      continue;
    }
    const tenantMatches = tenantsById.get(normalizedTenantId) ?? [];
    if (tenantMatches.length !== 1 || tenantMatches[0].active !== true) {
      quarantine('active_target_tenant_not_verified');
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
      owner.role !== 'guru' ||
      owner.tenant_id !== normalizedTenantId
    ) {
      quarantine('owner_profile_not_verified_for_tenant');
      continue;
    }
    const directoryMatches = directoryByUid.get(sourceOwnerUid) ?? [];
    if (directoryMatches.length !== 1) {
      quarantine('source_teacher_directory_missing_or_ambiguous');
      continue;
    }
    if (
      directoryMatches[0].data?.uid !== sourceOwnerUid ||
      directoryMatches[0].data?.role !== 'guru' ||
      directoryMatches[0].data?.tenantId !== sourceTenantId
    ) {
      quarantine('source_teacher_directory_mismatch');
      continue;
    }

    const encryptedMatches = filesBySourceKey.get(sourceKey) ?? [];
    if (encryptedMatches.length !== 1) {
      quarantine('encrypted_drive_file_missing_or_ambiguous');
      continue;
    }
    const encryptedFile = encryptedMatches[0];
    if (
      encryptedFile.ownerId !== owner.id ||
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
    const recipients = expectedRecipients(profiles, owner.id, normalizedTenantId);
    if (recipients.size > 100) {
      quarantine('planning_module_recipient_limit_exceeded');
      continue;
    }
    const sharesError = validateRecipientShares(encryptedFile, recipients);
    if (sharesError) {
      quarantine(sharesError);
      continue;
    }

    const proposal = {
      id: deterministicUuid(sourceKey),
      owner_id: owner.id,
      tenant_id: normalizedTenantId,
      drive_file_id: encryptedFile.driveFileId,
      category: 'planning',
      ciphertext_sha256: encryptedFile.ciphertextSha256,
      ciphertext_size_bytes: encryptedFile.ciphertextSizeBytes,
      encryption_version: encryptedFile.encryptionVersion,
      created_at: new Date(entry.data.createdAt).toISOString(),
      updated_at: new Date(entry.data.updatedAt).toISOString(),
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
      sourceModules: planningModules.length,
      sourceParentPackages: parentPackages.length,
      directoryEntries: directoryEntries.length,
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
    throw new Error('Usage: node scripts/reconcilePlanningModules.mjs <local-minimal-input.json>');
  }
  const report = reconcilePlanningModules(JSON.parse(await readFile(inputPath, 'utf8')));
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
