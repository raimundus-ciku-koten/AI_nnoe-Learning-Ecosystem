import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const UUID_NAMESPACE = 'f84b30ca-2482-5e6d-90aa-c595c58c2c9b';
const ANNOUNCEMENT_FIELDS = ['judul', 'isi', 'penulisUid', 'dibuat'];
const STAFF_ROLES = ['admin_sekolah', 'operator'];

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

const sourceKeyFor = (sourceTenantId, announcementId) =>
  `${sourceTenantId}/pengumuman/${announcementId}`;

const normalizeText = value => value.trim();

const normalizeAnnouncement = (entry, sourceTenantId) => {
  const data = entry.data;
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    Object.keys(data).sort().join(',') !== [...ANNOUNCEMENT_FIELDS].sort().join(',')
  ) {
    return { error: 'source_announcement_fields_invalid' };
  }
  if (
    typeof data.judul !== 'string' ||
    typeof data.isi !== 'string' ||
    typeof data.penulisUid !== 'string' ||
    data.penulisUid.length < 1 ||
    data.penulisUid.length > 256 ||
    !isValidIsoTimestamp(data.dibuat)
  ) {
    return { error: 'source_announcement_fields_invalid' };
  }
  const title = normalizeText(data.judul);
  const body = normalizeText(data.isi);
  if (title.length < 1 || title.length > 200 || body.length < 1 || body.length > 5000) {
    return { error: 'source_announcement_content_invalid' };
  }
  return {
    announcement: {
      sourceKey: sourceKeyFor(sourceTenantId, entry.announcementId),
      authorLegacyUid: data.penulisUid,
      title,
      body,
      createdAt: new Date(data.dibuat).toISOString(),
    },
  };
};

const validateInput = input => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Input must be a JSON object.');
  }
  for (const field of [
    'announcements',
    'tenantCrosswalk',
    'targetTenants',
    'profiles',
    'targetEntitlements',
    'targetAnnouncements',
  ]) {
    if (field === 'tenantCrosswalk') continue;
    if (!Array.isArray(input[field])) {
      throw new TypeError(`Input field "${field}" must be an array.`);
    }
  }
  if (!input.tenantCrosswalk || typeof input.tenantCrosswalk !== 'object' ||
      Array.isArray(input.tenantCrosswalk)) {
    throw new TypeError('Input field "tenantCrosswalk" must be a verified mapping object.');
  }
  if (!isValidIsoTimestamp(input.reconciledAt)) {
    throw new TypeError('Input field "reconciledAt" must be an ISO timestamp.');
  }
  return input;
};

const sameAnnouncement = (existing, proposal) =>
  existing.id === proposal.id &&
  existing.tenant_id === proposal.tenant_id &&
  existing.author_id === proposal.author_id &&
  existing.title === proposal.title &&
  existing.body === proposal.body &&
  Date.parse(existing.created_at) === Date.parse(proposal.created_at);

export function reconcileSchoolAnnouncements(input) {
  const {
    announcements,
    tenantCrosswalk,
    targetTenants,
    profiles,
    targetEntitlements,
    targetAnnouncements,
    reconciledAt,
  } = validateInput(input);
  const sourceByKey = indexBy(announcements, entry =>
    typeof entry?.tenantId === 'string' && typeof entry?.announcementId === 'string'
      ? sourceKeyFor(entry.tenantId.trim(), entry.announcementId)
      : null,
  );
  const profilesByLegacyUid = indexBy(profiles, profile => profile?.legacy_uid);
  const tenantsById = indexBy(targetTenants, tenant => tenant?.id);
  const entitlementsByTenant = indexBy(targetEntitlements, entitlement => entitlement?.tenant_id);
  const targetsById = indexBy(targetAnnouncements, announcement => announcement?.id);
  const crosswalkTargets = indexBy(
    Object.entries(tenantCrosswalk).map(([sourceId, targetId]) => ({ sourceId, targetId })),
    entry => typeof entry.targetId === 'string' ? entry.targetId.trim() : null,
  );
  const proposals = [];
  const alreadyPresent = [];
  const quarantined = [];
  const quarantine = reason => quarantined.push({ reason });

  for (const entry of announcements) {
    const sourceTenantId = typeof entry?.tenantId === 'string' ? entry.tenantId.trim() : '';
    const announcementId =
      typeof entry?.announcementId === 'string' ? entry.announcementId : '';
    if (!sourceTenantId || !announcementId || announcementId.includes('/')) {
      quarantine('source_announcement_path_invalid');
      continue;
    }
    const sourceKey = sourceKeyFor(sourceTenantId, announcementId);
    if ((sourceByKey.get(sourceKey) ?? []).length !== 1) {
      quarantine('source_announcement_not_unique');
      continue;
    }
    const normalizedResult = normalizeAnnouncement(entry, sourceTenantId);
    if (normalizedResult.error) {
      quarantine(normalizedResult.error);
      continue;
    }
    const normalized = normalizedResult.announcement;

    const targetTenantId = tenantCrosswalk[sourceTenantId];
    if (typeof targetTenantId !== 'string' || !targetTenantId.trim()) {
      quarantine('verified_tenant_crosswalk_missing');
      continue;
    }
    const tenantId = targetTenantId.trim();
    if ((crosswalkTargets.get(tenantId) ?? []).length !== 1) {
      quarantine('tenant_crosswalk_target_not_unique');
      continue;
    }
    const tenantMatches = tenantsById.get(tenantId) ?? [];
    if (tenantMatches.length !== 1 || tenantMatches[0].active !== true) {
      quarantine('active_target_tenant_not_verified');
      continue;
    }

    const authorMatches = profilesByLegacyUid.get(normalized.authorLegacyUid) ?? [];
    if (authorMatches.length !== 1) {
      quarantine('announcement_author_legacy_uid_not_unique');
      continue;
    }
    const author = authorMatches[0];
    if (
      !isUuid(author.id) ||
      !STAFF_ROLES.includes(author.role) ||
      author.tenant_id !== tenantId
    ) {
      quarantine('announcement_author_profile_mismatch');
      continue;
    }

    const entitlementMatches = entitlementsByTenant.get(tenantId) ?? [];
    const validEntitlements = entitlementMatches.filter(entitlement =>
      ['trial', 'active'].includes(entitlement.status) &&
      (!entitlement.valid_until || Date.parse(entitlement.valid_until) > Date.parse(reconciledAt)),
    );
    const proposal = {
      id: deterministicUuid(sourceKey),
      tenant_id: tenantId,
      author_id: author.id,
      title: normalized.title,
      body: normalized.body,
      created_at: normalized.createdAt,
    };

    const targetMatches = targetsById.get(proposal.id) ?? [];
    if (targetMatches.length > 1) {
      quarantine('target_announcement_id_not_unique');
      continue;
    }
    if (targetMatches.length === 1) {
      if (sameAnnouncement(targetMatches[0], proposal)) {
        alreadyPresent.push(proposal.id);
      } else {
        quarantine('target_announcement_metadata_conflict');
      }
      continue;
    }
    if (entitlementMatches.length > 1 || validEntitlements.length !== 1) {
      quarantine('target_tenant_entitlement_not_verified_for_writes');
      continue;
    }
    proposals.push(proposal);
  }

  return {
    mode: 'report-only',
    summary: {
      sourceAnnouncements: announcements.length,
      targetTenants: targetTenants.length,
      profiles: profiles.length,
      targetEntitlements: targetEntitlements.length,
      targetAnnouncements: targetAnnouncements.length,
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
    throw new Error('Usage: node scripts/reconcileSchoolAnnouncements.mjs <local-minimal-input.json>');
  }
  const report = reconcileSchoolAnnouncements(JSON.parse(await readFile(inputPath, 'utf8')));
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
