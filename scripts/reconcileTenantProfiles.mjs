import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const normalizeText = value => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text && !['null', 'none', 'n/a'].includes(text.toLowerCase()) ? text : null;
};

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

const validateInput = input => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Input must be a JSON object.');
  }
  for (const field of ['firestoreTenants', 'targetTenants', 'profiles']) {
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

const parseOptionalString = (data, field, maxLength, validate = () => true) => {
  if (!(field in data) || data[field] === null) return { present: false };
  if (typeof data[field] !== 'string') return { error: `${field}_type_invalid` };
  const value = normalizeText(data[field]);
  if (value && (value.length > maxLength || !validate(value))) {
    return { error: `${field}_invalid` };
  }
  return { present: true, value };
};

const validateAcademicYear = value => {
  const match = /^(\d{4})\/(\d{4})$/.exec(value);
  return Boolean(match && Number(match[2]) === Number(match[1]) + 1);
};

const mapTenantProfile = (source, profilesByLegacyUid, targetTenantId) => {
  const data = source.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { error: 'source_document_data_invalid' };
  }
  if (
    ['nama', 'namaSekolah'].some(
      field => data[field] !== undefined && data[field] !== null && typeof data[field] !== 'string',
    )
  ) {
    return { error: 'school_name_type_invalid' };
  }
  const schoolName = normalizeText(data.namaSekolah);
  const generalName = normalizeText(data.nama);
  if (schoolName && generalName && schoolName !== generalName) {
    return { error: 'school_name_fields_conflict' };
  }
  const name = schoolName ?? generalName;
  if (!name || name.length > 160 || /[\u0000-\u001f\u007f]/.test(name)) {
    return { error: 'school_name_missing_or_invalid' };
  }
  if (!isValidIsoTimestamp(data.createdAt)) {
    return { error: 'created_at_missing_or_invalid' };
  }
  if (
    data.waktuUbah !== undefined &&
    data.waktuUbah !== null &&
    !isValidIsoTimestamp(data.waktuUbah)
  ) {
    return { error: 'updated_at_missing_or_invalid' };
  }

  const mapped = {
    name,
    created_at: new Date(data.createdAt).toISOString(),
    updated_at: new Date(data.waktuUbah ?? data.createdAt).toISOString(),
  };
  if (Date.parse(mapped.updated_at) < Date.parse(mapped.created_at)) {
    return { error: 'updated_at_precedes_created_at' };
  }

  const optionalFields = [
    ['jenjang', 'education_level', 120],
    ['npsn', 'npsn', 12, value => /^\d{1,12}$/.test(value)],
    ['kepalaSekolah', 'headmaster_name', 150],
    ['nipKepalaSekolah', 'headmaster_nip', 25, value => /^[0-9 ]+$/.test(value)],
    ['tahunAjaran', 'academic_year', 9, validateAcademicYear],
  ];
  for (const [sourceField, targetField, maxLength, validate] of optionalFields) {
    const result = parseOptionalString(data, sourceField, maxLength, validate);
    if (result.error) return { error: result.error };
    if (result.present) mapped[targetField] = result.value;
  }

  if ('semester' in data && data.semester !== null) {
    if (typeof data.semester !== 'string') return { error: 'semester_type_invalid' };
    const semester = normalizeText(data.semester);
    if (semester && !['Ganjil', 'Genap'].includes(semester)) {
      return { error: 'semester_invalid' };
    }
    mapped.semester = semester?.toLowerCase() ?? null;
  }

  if ('diperbaruiOleh' in data && data.diperbaruiOleh !== null) {
    if (typeof data.diperbaruiOleh !== 'string') {
      return { error: 'updated_by_type_invalid' };
    }
    const legacyUid = normalizeText(data.diperbaruiOleh);
    if (legacyUid) {
      const matches = profilesByLegacyUid.get(legacyUid) ?? [];
      if (matches.length === 1 && isUuid(matches[0].id)) {
        mapped.updated_by = matches[0].id;
      } else {
        mapped.updated_by = null;
        return { mapped, observation: 'updated_by_profile_unlinked' };
      }
    } else {
      mapped.updated_by = null;
    }
  }

  return { mapped };
};

export function reconcileTenantProfiles(input) {
  const { firestoreTenants, targetTenants, profiles, tenantCrosswalk } = validateInput(input);
  const sourceById = indexBy(firestoreTenants, source => normalizeText(source?.documentId));
  const targetById = indexBy(targetTenants, target => normalizeText(target?.id));
  const profilesByLegacyUid = indexBy(profiles, profile => normalizeText(profile?.legacy_uid));
  const crosswalkTargets = indexBy(
    Object.entries(tenantCrosswalk).map(([sourceId, targetId]) => ({ sourceId, targetId })),
    entry => normalizeText(entry.targetId),
  );
  const proposals = [];
  const quarantined = [];
  const observations = [];
  const quarantine = reason => quarantined.push({ reason });

  for (const source of firestoreTenants) {
    const sourceId = normalizeText(source?.documentId);
    if (!sourceId) {
      quarantine('source_document_id_missing');
      continue;
    }
    if ((sourceById.get(sourceId) ?? []).length !== 1) {
      quarantine('source_document_id_not_unique');
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
    if (targetMatches.length !== 1) {
      quarantine(targetMatches.length ? 'target_tenant_id_not_unique' : 'new_tenant_requires_verified_active_status');
      continue;
    }
    const target = targetMatches[0];
    if (
      typeof target.active !== 'boolean' ||
      !normalizeText(target.name) ||
      !isValidIsoTimestamp(target.created_at) ||
      !isValidIsoTimestamp(target.updated_at)
    ) {
      quarantine('target_tenant_required_fields_invalid');
      continue;
    }

    const result = mapTenantProfile(source, profilesByLegacyUid, targetId);
    if (result.error) {
      quarantine(result.error);
      continue;
    }
    if (result.observation) observations.push({ reason: result.observation });
    if (
      Date.parse(result.mapped.created_at) !== Date.parse(target.created_at) ||
      result.mapped.name !== normalizeText(target.name) ||
      Date.parse(result.mapped.updated_at) !== Date.parse(target.updated_at)
    ) {
      observations.push({ reason: 'source_identity_differs_target_preserved' });
    }
    const patch = {};
    for (const field of [
      'education_level',
      'npsn',
      'headmaster_name',
      'headmaster_nip',
      'academic_year',
      'semester',
      'updated_by',
    ]) {
      const sourceValue = result.mapped[field];
      if (sourceValue == null) continue;
      if (target[field] == null) {
        patch[field] = sourceValue;
      } else if (target[field] !== sourceValue) {
        observations.push({ reason: 'tenant_profile_field_conflict_preserved' });
      }
    }
    if (Object.keys(patch).length) proposals.push({ id: targetId, fields: patch });
  }

  return {
    mode: 'report-only',
    summary: {
      sourceTenants: firestoreTenants.length,
      targetTenants: targetTenants.length,
      proposals: proposals.length,
      quarantined: quarantined.length,
      observations: observations.length,
    },
    proposals,
    quarantined,
    observations,
  };
}

async function runCli(argv) {
  const inputPath = argv[2];
  if (!inputPath || argv.length !== 3) {
    throw new Error('Usage: node scripts/reconcileTenantProfiles.mjs <local-minimal-input.json>');
  }
  const report = reconcileTenantProfiles(JSON.parse(await readFile(inputPath, 'utf8')));
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
