import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

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

const validateInput = input => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Input must be a JSON object.');
  }
  for (const field of ['firestoreTenants', 'targetTenants']) {
    if (!Array.isArray(input[field])) {
      throw new TypeError(`Input field "${field}" must be an array.`);
    }
  }
  if (input.tenantReferences !== undefined && !Array.isArray(input.tenantReferences)) {
    throw new TypeError('Input field "tenantReferences" must be an array when provided.');
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

export function reconcileTenants(input) {
  const {
    firestoreTenants,
    targetTenants,
    tenantReferences = [],
    tenantCrosswalk,
  } = validateInput(input);
  const sourceById = indexBy(firestoreTenants, tenant => normalizeText(tenant.documentId));
  const targetById = indexBy(targetTenants, tenant => normalizeText(tenant.id));
  const crosswalkTargets = indexBy(
    Object.entries(tenantCrosswalk).map(([sourceId, targetId]) => ({ sourceId, targetId })),
    entry => normalizeText(entry.targetId),
  );
  const targetIds = new Set(targetTenants.map(tenant => normalizeText(tenant.id)).filter(Boolean));
  const quarantined = [];
  const observations = [];
  let matchedExisting = 0;
  let pendingCreation = 0;

  const quarantine = reason => quarantined.push({ reason });

  for (const source of firestoreTenants) {
    const sourceId = normalizeText(source.documentId);
    if (!sourceId) {
      quarantine('source_document_id_missing');
      continue;
    }
    if ((sourceById.get(sourceId) ?? []).length !== 1) {
      quarantine('source_document_id_not_unique');
      continue;
    }

    const data = source.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      quarantine('source_document_data_invalid');
      continue;
    }
    if (
      ['nama', 'namaSekolah'].some(
        field => data[field] !== undefined && data[field] !== null && typeof data[field] !== 'string',
      )
    ) {
      quarantine('school_name_type_invalid');
      continue;
    }
    const schoolName = normalizeText(data.namaSekolah);
    const generalName = normalizeText(data.nama);
    if (schoolName && generalName && schoolName !== generalName) {
      quarantine('school_name_fields_conflict');
      continue;
    }
    const name = schoolName ?? generalName;
    if (!name || name.length > 160 || /[\u0000-\u001f\u007f]/.test(name)) {
      quarantine('school_name_missing_or_invalid');
      continue;
    }
    if (!isValidIsoTimestamp(data.createdAt)) {
      quarantine('created_at_missing_or_invalid');
      continue;
    }
    if (data.jenjang !== undefined && data.jenjang !== null && typeof data.jenjang !== 'string') {
      quarantine('jenjang_type_invalid');
      continue;
    }

    const targetId = normalizeText(tenantCrosswalk[sourceId]);
    if (!targetId) {
      quarantine('verified_tenant_crosswalk_missing');
      continue;
    }
    if ((crosswalkTargets.get(targetId) ?? []).length !== 1) {
      quarantine('tenant_crosswalk_target_not_unique');
      continue;
    }

    const targetMatches = targetById.get(targetId) ?? [];
    if (targetMatches.length > 1) {
      quarantine('target_tenant_id_not_unique');
      continue;
    }
    if (targetMatches.length === 0) {
      pendingCreation += 1;
      observations.push({ reason: 'new_tenant_requires_verified_active_status' });
      continue;
    }

    const target = targetMatches[0];
    if (
      typeof target.active !== 'boolean' ||
      !normalizeText(target.name) ||
      normalizeText(target.name).length > 160 ||
      !isValidIsoTimestamp(target.created_at) ||
      !isValidIsoTimestamp(target.updated_at)
    ) {
      quarantine('target_tenant_required_fields_invalid');
      continue;
    }
    matchedExisting += 1;
    if (name !== normalizeText(target.name)) {
      observations.push({ reason: 'source_name_differs_target_preserved' });
    }
    if (Date.parse(data.createdAt) !== Date.parse(target.created_at)) {
      observations.push({ reason: 'source_created_at_differs_target_preserved' });
    }
  }

  for (const reference of tenantReferences) {
    const targetId = normalizeText(reference);
    if (targetId && !targetIds.has(targetId)) {
      observations.push({ reason: 'target_tenant_reference_missing' });
    }
  }

  return {
    mode: 'report-only',
    summary: {
      sourceTenants: firestoreTenants.length,
      targetTenants: targetTenants.length,
      references: tenantReferences.length,
      matchedExisting,
      pendingCreation,
      quarantined: quarantined.length,
      observations: observations.length,
    },
    quarantined,
    observations,
  };
}

async function runCli(argv) {
  const inputPath = argv[2];
  if (!inputPath || argv.length !== 3) {
    throw new Error('Usage: node scripts/reconcileTenants.mjs <local-minimal-input.json>');
  }
  const report = reconcileTenants(JSON.parse(await readFile(inputPath, 'utf8')));
  process.stdout.write(`${JSON.stringify({
    mode: report.mode,
    summary: report.summary,
    quarantineReasons: report.quarantined.reduce((counts, item) => {
      counts[item.reason] = (counts[item.reason] ?? 0) + 1;
      return counts;
    }, {}),
    observationReasons: report.observations.reduce((counts, item) => {
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
