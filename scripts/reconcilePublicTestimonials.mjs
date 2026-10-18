import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const UUID_NAMESPACE = '762979a6-96e2-5b69-a125-955a1e72b83b';
const PUBLIC_FIELDS = [
  'tenantId',
  'sourceId',
  'status',
  'consent',
  'displayName',
  'role',
  'quote',
];
const MODERATION_FIELDS = [
  'ownerUid',
  'tenantId',
  'displayName',
  'role',
  'quote',
  'rating',
  'consent',
  'status',
  'submittedAt',
  'updatedAt',
  'quoteFinal',
  'reviewedAt',
];

const normalizeText = value => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text && !['null', 'none', 'n/a'].includes(text.toLowerCase()) ? text : null;
};

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

const deterministicUuid = sourceId => {
  const namespace = Buffer.from(UUID_NAMESPACE.replaceAll('-', ''), 'hex');
  const digest = createHash('sha1')
    .update(namespace)
    .update(sourceId, 'utf8')
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
    'firestorePublicTestimonials',
    'firestoreModerationTestimonials',
    'targetTenants',
    'targetTestimonials',
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

const validatePublicRecord = (entry, sourceId) => {
  const data = entry.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return 'public_source_data_invalid';
  }
  if (Object.keys(data).sort().join(',') !== [...PUBLIC_FIELDS].sort().join(',')) {
    return 'public_source_fields_invalid';
  }
  if (
    typeof data.tenantId !== 'string' ||
    !normalizeText(data.tenantId) ||
    data.sourceId !== sourceId ||
    data.status !== 'published' ||
    data.consent !== true ||
    typeof data.displayName !== 'string' ||
    data.displayName.length < 1 ||
    data.displayName.length > 80 ||
    !normalizeText(data.displayName) ||
    typeof data.role !== 'string' ||
    data.role.length < 1 ||
    data.role.length > 40 ||
    !normalizeText(data.role) ||
    typeof data.quote !== 'string' ||
    data.quote.length < 1 ||
    data.quote.length > 300
  ) {
    return 'public_source_fields_invalid';
  }
  return null;
};

const validateModerationRecord = (entry, sourceId, tenantId) => {
  const data = entry.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return 'moderation_source_data_invalid';
  }
  if (Object.keys(data).some(field => !MODERATION_FIELDS.includes(field))) {
    return 'moderation_source_fields_invalid';
  }
  if (
    data.ownerUid !== sourceId ||
    data.tenantId !== tenantId ||
    data.status !== 'published' ||
    data.consent !== true ||
    ![4, 5].includes(data.rating) ||
    typeof data.displayName !== 'string' ||
    typeof data.role !== 'string' ||
    typeof data.quote !== 'string' ||
    typeof data.quoteFinal !== 'string' ||
    data.quoteFinal.length < 1 ||
    data.quoteFinal.length > 300 ||
    !isValidIsoTimestamp(data.submittedAt) ||
    !isValidIsoTimestamp(data.updatedAt) ||
    !isValidIsoTimestamp(data.reviewedAt)
  ) {
    return 'moderation_source_not_approved';
  }
  if (
    data.displayName !== entry.publicData.displayName ||
    data.role !== entry.publicData.role ||
    data.quoteFinal !== entry.publicData.quote
  ) {
    return 'public_source_does_not_match_moderation';
  }
  if (
    Date.parse(data.submittedAt) > Date.parse(data.reviewedAt) ||
    Date.parse(data.updatedAt) > Date.parse(data.reviewedAt)
  ) {
    return 'moderation_timestamps_invalid';
  }
  return null;
};

const sameTarget = (existing, proposal) =>
  existing.tenant_id === proposal.tenant_id &&
  existing.display_name === proposal.display_name &&
  existing.role === proposal.role &&
  existing.quote === proposal.quote &&
  existing.consent === true &&
  existing.status === 'published' &&
  existing.published_at &&
  Date.parse(existing.published_at) === Date.parse(proposal.published_at);

export function reconcilePublicTestimonials(input) {
  const {
    firestorePublicTestimonials,
    firestoreModerationTestimonials,
    targetTenants,
    targetTestimonials,
    tenantCrosswalk,
  } = validateInput(input);
  const publicById = indexBy(firestorePublicTestimonials, record => normalizeText(record?.documentId));
  const moderationByTenantAndId = indexBy(
    firestoreModerationTestimonials,
    record => typeof record?.tenantId === 'string' && typeof record?.documentId === 'string'
      ? `${record.tenantId.trim()}/${record.documentId.trim()}`
      : null,
  );
  const tenantsById = indexBy(targetTenants, tenant => normalizeText(tenant?.id));
  const targetsById = indexBy(targetTestimonials, testimonial => normalizeText(testimonial?.id));
  const crosswalkTargets = indexBy(
    Object.entries(tenantCrosswalk).map(([sourceId, targetId]) => ({ sourceId, targetId })),
    entry => normalizeText(entry.targetId),
  );
  const proposals = [];
  const alreadyPresent = [];
  const quarantined = [];
  const quarantine = reason => quarantined.push({ reason });

  for (const entry of firestorePublicTestimonials) {
    const sourceId = normalizeText(entry?.documentId);
    if (!sourceId) {
      quarantine('source_document_id_missing');
      continue;
    }
    if ((publicById.get(sourceId) ?? []).length !== 1) {
      quarantine('source_document_id_not_unique');
      continue;
    }
    const publicError = validatePublicRecord(entry, sourceId);
    if (publicError) {
      quarantine(publicError);
      continue;
    }

    const sourceTenantId = normalizeText(entry.data.tenantId);
    const targetTenantId = normalizeText(tenantCrosswalk[sourceTenantId]);
    if (!targetTenantId) {
      quarantine('verified_tenant_crosswalk_missing');
      continue;
    }
    if ((crosswalkTargets.get(targetTenantId) ?? []).length !== 1) {
      quarantine('tenant_crosswalk_target_not_unique');
      continue;
    }
    const targetTenantMatches = tenantsById.get(targetTenantId) ?? [];
    if (targetTenantMatches.length !== 1 || targetTenantMatches[0].active !== true) {
      quarantine('active_target_tenant_not_verified');
      continue;
    }

    const moderationMatches =
      moderationByTenantAndId.get(`${sourceTenantId}/${sourceId}`) ?? [];
    if (moderationMatches.length !== 1) {
      quarantine('moderation_source_missing_or_ambiguous');
      continue;
    }
    const moderation = moderationMatches[0];
    const moderationError = validateModerationRecord({
      ...moderation,
      publicData: entry.data,
    }, sourceId, sourceTenantId);
    if (moderationError) {
      quarantine(moderationError);
      continue;
    }

    const proposal = {
      id: deterministicUuid(sourceId),
      tenant_id: targetTenantId,
      display_name: entry.data.displayName.trim(),
      role: entry.data.role.trim(),
      quote: entry.data.quote,
      consent: true,
      status: 'published',
      published_at: new Date(moderation.data.reviewedAt).toISOString(),
    };
    const existingMatches = targetsById.get(proposal.id) ?? [];
    if (existingMatches.length > 1) {
      quarantine('target_testimonial_id_not_unique');
      continue;
    }
    if (existingMatches.length === 1) {
      if (sameTarget(existingMatches[0], proposal)) {
        alreadyPresent.push(proposal.id);
      } else {
        quarantine('target_testimonial_metadata_conflict');
      }
      continue;
    }
    proposals.push(proposal);
  }

  return {
    mode: 'report-only',
    summary: {
      publicSourceEntries: firestorePublicTestimonials.length,
      moderationSourceEntries: firestoreModerationTestimonials.length,
      targetTenants: targetTenants.length,
      targetTestimonials: targetTestimonials.length,
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
    throw new Error('Usage: node scripts/reconcilePublicTestimonials.mjs <local-minimal-input.json>');
  }
  const report = reconcilePublicTestimonials(JSON.parse(await readFile(inputPath, 'utf8')));
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
