import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const ENTRY_FIELDS = [
  'ownerUid',
  'modulePath',
  'moduleLabel',
  'judul',
  'tanggal',
  'kelas',
  'mapel',
  'isi',
  'status',
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

const isValidDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

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

const sourceKeyFor = (tenantId, ownerUid, entryId) => `${tenantId}/${ownerUid}/${entryId}`;

const validateInput = input => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Input must be a JSON object.');
  }
  for (const field of [
    'workspaceEntries',
    'profiles',
    'tenantTargets',
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

const validateEntry = (entry, sourceOwnerUid) => {
  const data = entry.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return 'source_entry_data_invalid';
  }
  if (Object.keys(data).sort().join(',') !== [...ENTRY_FIELDS].sort().join(',')) {
    return 'source_entry_fields_invalid';
  }
  if (data.ownerUid !== sourceOwnerUid) return 'source_owner_uid_mismatch';
  if (
    typeof data.modulePath !== 'string' ||
    !/^\/(pelaksanaan|asesmen|pemantauan|refleksi|laporan|kolaborasi|pengaturan|perangkat)\/[a-z0-9-]+$/.test(data.modulePath)
  ) {
    return 'module_path_invalid';
  }
  if (
    typeof data.moduleLabel !== 'string' ||
    data.moduleLabel.length < 1 ||
    data.moduleLabel.length > 100
  ) {
    return 'module_label_invalid';
  }
  if (typeof data.judul !== 'string' || data.judul.length < 1 || data.judul.length > 120) {
    return 'title_invalid';
  }
  if (!isValidDate(data.tanggal)) return 'entry_date_invalid';
  if (typeof data.kelas !== 'string' || data.kelas.length > 80) return 'class_value_invalid';
  if (typeof data.mapel !== 'string' || data.mapel.length > 80) return 'subject_value_invalid';
  if (typeof data.isi !== 'string' || data.isi.length < 1 || data.isi.length > 6000) {
    return 'entry_content_invalid';
  }
  if (!['draf', 'selesai'].includes(data.status)) return 'entry_status_invalid';
  if (!isValidIsoTimestamp(data.createdAt) || !isValidIsoTimestamp(data.updatedAt)) {
    return 'entry_timestamp_invalid';
  }
  if (Date.parse(data.createdAt) > Date.parse(data.updatedAt)) {
    return 'entry_updated_at_precedes_created_at';
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

export function reconcileTeacherWorkspace(input) {
  const {
    workspaceEntries,
    profiles,
    tenantTargets,
    encryptedDriveFiles,
    targetDriveFiles,
    tenantCrosswalk,
  } = validateInput(input);

  const sourceByKey = indexBy(workspaceEntries, entry =>
    typeof entry?.tenantId === 'string' &&
    typeof entry?.ownerUid === 'string' &&
    typeof entry?.entryId === 'string'
      ? sourceKeyFor(entry.tenantId.trim(), entry.ownerUid.trim(), entry.entryId.trim())
      : null,
  );
  const profilesByLegacyUid = indexBy(profiles, profile => profile?.legacy_uid);
  const tenantsById = indexBy(tenantTargets, tenant => tenant?.id);
  const crosswalkTargets = indexBy(
    Object.entries(tenantCrosswalk).map(([sourceId, targetId]) => ({ sourceId, targetId })),
    entry => typeof entry.targetId === 'string' ? entry.targetId.trim() : null,
  );
  const encryptedBySourceKey = indexBy(encryptedDriveFiles, file => file?.sourceKey);
  const targetByOwnerDriveId = indexBy(
    targetDriveFiles,
    file => `${file?.owner_id}/${file?.drive_file_id}`,
  );
  const proposals = [];
  const alreadyPresent = [];
  const quarantined = [];
  const observations = [];
  const quarantine = reason => quarantined.push({ reason });

  for (const entry of workspaceEntries) {
    const tenantId = typeof entry?.tenantId === 'string' ? entry.tenantId.trim() : '';
    const ownerUid = typeof entry?.ownerUid === 'string' ? entry.ownerUid.trim() : '';
    const entryId = typeof entry?.entryId === 'string' ? entry.entryId.trim() : '';
    if (!tenantId || !ownerUid || !entryId) {
      quarantine('source_path_or_document_id_missing');
      continue;
    }
    const sourceKey = sourceKeyFor(tenantId, ownerUid, entryId);
    if ((sourceByKey.get(sourceKey) ?? []).length !== 1) {
      quarantine('source_entry_not_unique');
      continue;
    }
    const invalidEntry = validateEntry(entry, ownerUid);
    if (invalidEntry) {
      quarantine(invalidEntry);
      continue;
    }

    const targetTenantId = tenantCrosswalk[tenantId];
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

    const ownerMatches = profilesByLegacyUid.get(ownerUid) ?? [];
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

    const encryptedMatches = encryptedBySourceKey.get(sourceKey) ?? [];
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
      tenant_id: normalizedTenantId,
      drive_file_id: encryptedFile.driveFileId,
      category: 'other',
      ciphertext_sha256: encryptedFile.ciphertextSha256,
      ciphertext_size_bytes: encryptedFile.ciphertextSizeBytes,
      encryption_version: encryptedFile.encryptionVersion,
      created_at: new Date(entry.data.createdAt).toISOString(),
      updated_at: new Date(entry.data.updatedAt).toISOString(),
      revoked_at: null,
    };
    const targetKey = `${proposal.owner_id}/${proposal.drive_file_id}`;
    const targetMatches = targetByOwnerDriveId.get(targetKey) ?? [];
    if (targetMatches.length > 1) {
      quarantine('target_drive_file_not_unique');
      continue;
    }
    if (targetMatches.length === 1) {
      if (sameTargetFile(targetMatches[0], proposal)) {
        alreadyPresent.push({
          owner_id: proposal.owner_id,
          drive_file_id: proposal.drive_file_id,
        });
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
      sourceEntries: workspaceEntries.length,
      profiles: profiles.length,
      encryptedDriveFiles: encryptedDriveFiles.length,
      targetDriveFiles: targetDriveFiles.length,
      proposals: proposals.length,
      alreadyPresent: alreadyPresent.length,
      quarantined: quarantined.length,
      observations: observations.length,
    },
    proposals,
    alreadyPresent,
    quarantined,
    observations,
  };
}

async function runCli(argv) {
  const inputPath = argv[2];
  if (!inputPath || argv.length !== 3) {
    throw new Error('Usage: node scripts/reconcileTeacherWorkspace.mjs <local-minimal-input.json>');
  }
  const report = reconcileTeacherWorkspace(JSON.parse(await readFile(inputPath, 'utf8')));
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
