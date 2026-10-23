import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { buatKodeSiswa, kodeSiswaValid } from '../web/src/pages/dataDasar/kodeSiswa.js';

const UUID_NAMESPACE = '3957e3cb-9a84-5f63-8d5e-f161cd62c990';
const STUDENT_FIELDS = [
  'nama',
  'nisn',
  'jk',
  'kelas',
  'kodeUnik',
  'urlScan',
  'dibuat',
  'diperbarui',
];

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

const sourceKeyFor = (ownerUid, studentDocumentId) =>
  `${ownerUid}/siswa/${studentDocumentId}`;

const normalizeText = value => value.replace(/\s+/g, ' ').trim();
const hasControlCharacters = value => /[\u0000-\u001f\u007f-\u009f]/u.test(value);

const sourceFieldsValid = data =>
  data &&
  typeof data === 'object' &&
  !Array.isArray(data) &&
  Object.keys(data).every(field => STUDENT_FIELDS.includes(field)) &&
  ['nama', 'kelas', 'diperbarui'].every(field => Object.hasOwn(data, field));

const normalizeStudent = (entry, ownerUid, studentDocumentId, reconciledAt) => {
  const data = entry.data;
  if (!sourceFieldsValid(data)) return { error: 'source_student_fields_invalid' };
  if (typeof data.nama !== 'string' || typeof data.kelas !== 'string') {
    return { error: 'source_student_name_or_class_invalid' };
  }

  const nama = normalizeText(data.nama);
  const kelas = normalizeText(data.kelas);
  if (
    nama.length < 1 ||
    nama.length > 100 ||
    kelas.length < 1 ||
    kelas.length > 30 ||
    hasControlCharacters(nama) ||
    hasControlCharacters(kelas)
  ) {
    return { error: 'source_student_name_or_class_invalid' };
  }

  let nisn = null;
  if (Object.hasOwn(data, 'nisn')) {
    if (typeof data.nisn !== 'string') return { error: 'source_student_nisn_invalid' };
    const normalizedNisn = data.nisn.trim();
    if (normalizedNisn && !/^[0-9]{1,20}$/.test(normalizedNisn)) {
      return { error: 'source_student_nisn_invalid' };
    }
    nisn = normalizedNisn || null;
  }

  let jk = null;
  if (Object.hasOwn(data, 'jk')) {
    if (typeof data.jk !== 'string') return { error: 'source_student_gender_invalid' };
    const normalizedGender = data.jk.trim().toUpperCase();
    if (normalizedGender && !['L', 'P'].includes(normalizedGender)) {
      return { error: 'source_student_gender_invalid' };
    }
    jk = normalizedGender || null;
  }

  if (!isValidIsoTimestamp(data.diperbarui)) {
    return { error: 'source_student_timestamp_invalid' };
  }
  if (Object.hasOwn(data, 'dibuat') && !isValidIsoTimestamp(data.dibuat)) {
    return { error: 'source_student_timestamp_invalid' };
  }
  if (
    Object.hasOwn(data, 'dibuat') &&
    Date.parse(data.dibuat) > Date.parse(data.diperbarui)
  ) {
    return { error: 'source_student_timestamp_invalid' };
  }

  const sourceKey = sourceKeyFor(ownerUid, studentDocumentId);
  let kodeUnik;
  if (Object.hasOwn(data, 'kodeUnik')) {
    if (typeof data.kodeUnik !== 'string' || !kodeSiswaValid(data.kodeUnik.trim())) {
      return { error: 'source_student_code_invalid' };
    }
    kodeUnik = data.kodeUnik.trim();
  } else {
    kodeUnik = buatKodeSiswa({
      id: sourceKey,
      nama,
      nisn: nisn ?? '',
      kelas,
    });
  }

  if (Object.hasOwn(data, 'urlScan')) {
    const scanSuffix = `/#/scan/${encodeURIComponent(data.kodeUnik || '')}`;
    const validHost =
      typeof data.urlScan === 'string' &&
      data.urlScan.endsWith(scanSuffix) &&
      (/^https:\/\/[^#]+\/#\/scan\/[A-Z0-9-]+$/.test(data.urlScan) ||
        /^http:\/\/localhost(:[0-9]{1,5})?(\/[^#]*)?\/#\/scan\/[A-Z0-9-]+$/.test(data.urlScan));
    if (!data.kodeUnik || !validHost) return { error: 'source_student_scan_url_invalid' };
  }

  return {
    student: {
      id: deterministicUuid(sourceKey),
      sourceKey,
      ownerUid,
      nama,
      kelas,
      nisn,
      jk,
      kode_unik: kodeUnik,
      created_at: Object.hasOwn(data, 'dibuat')
        ? new Date(data.dibuat).toISOString()
        : new Date(reconciledAt).toISOString(),
      updated_at: new Date(data.diperbarui).toISOString(),
    },
  };
};

const validateInput = input => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Input must be a JSON object.');
  }
  for (const field of [
    'studentRecords',
    'profiles',
    'targetTenants',
    'targetEntitlements',
    'targetStudents',
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

const sameStudent = (existing, proposal) =>
  existing.id === proposal.id &&
  existing.tenant_id === proposal.tenant_id &&
  existing.owner_id === proposal.owner_id &&
  existing.nama === proposal.nama &&
  existing.kelas === proposal.kelas &&
  (existing.nisn ?? null) === proposal.nisn &&
  (existing.jk ?? null) === proposal.jk &&
  existing.kode_unik === proposal.kode_unik &&
  Date.parse(existing.created_at) === Date.parse(proposal.created_at) &&
  Date.parse(existing.updated_at) === Date.parse(proposal.updated_at);

export function reconcileStudents(input) {
  const {
    studentRecords,
    profiles,
    targetTenants,
    targetEntitlements,
    targetStudents,
    reconciledAt,
  } = validateInput(input);
  const sourceByKey = indexBy(studentRecords, entry =>
    typeof entry?.ownerUid === 'string' && typeof entry?.documentId === 'string'
      ? sourceKeyFor(entry.ownerUid.trim(), entry.documentId)
      : null,
  );
  const profilesByLegacyUid = indexBy(profiles, profile => profile?.legacy_uid);
  const tenantsById = indexBy(targetTenants, tenant => tenant?.id);
  const entitlementsByTenant = indexBy(targetEntitlements, entitlement => entitlement?.tenant_id);
  const targetById = indexBy(targetStudents, student => student?.id);
  const targetByCode = indexBy(targetStudents, student => student?.kode_unik);
  const targetByOwnerNisn = indexBy(
    targetStudents,
    student => student?.nisn ? `${student.owner_id}/${student.nisn}` : null,
  );
  const normalizedRecords = [];
  const quarantined = [];
  const quarantine = reason => quarantined.push({ reason });

  for (const entry of studentRecords) {
    const ownerUid = typeof entry?.ownerUid === 'string' ? entry.ownerUid.trim() : '';
    const documentId = typeof entry?.documentId === 'string' ? entry.documentId : '';
    if (!ownerUid || !documentId || documentId.includes('/') || documentId.length > 256) {
      quarantine('source_path_or_student_id_invalid');
      continue;
    }
    const sourceKey = sourceKeyFor(ownerUid, documentId);
    if ((sourceByKey.get(sourceKey) ?? []).length !== 1) {
      quarantine('source_student_not_unique');
      continue;
    }
    const normalized = normalizeStudent(entry, ownerUid, documentId, reconciledAt);
    if (normalized.error) {
      quarantine(normalized.error);
      continue;
    }
    normalizedRecords.push(normalized.student);
  }

  const codeCounts = indexBy(normalizedRecords, student => student.kode_unik);
  const ownerNisnCounts = indexBy(
    normalizedRecords,
    student => student.nisn ? `${student.ownerUid}/${student.nisn}` : null,
  );
  const proposals = [];
  const alreadyPresent = [];
  const targetIdSeen = new Set();

  for (const normalized of normalizedRecords) {
    if ((codeCounts.get(normalized.kode_unik) ?? []).length > 1) {
      quarantine('duplicate_source_student_code');
      continue;
    }
    if (
      normalized.nisn &&
      (ownerNisnCounts.get(`${normalized.ownerUid}/${normalized.nisn}`) ?? []).length > 1
    ) {
      quarantine('duplicate_source_student_nisn');
      continue;
    }

    const ownerMatches = profilesByLegacyUid.get(normalized.ownerUid) ?? [];
    if (ownerMatches.length !== 1) {
      quarantine('owner_legacy_uid_not_unique');
      continue;
    }
    const owner = ownerMatches[0];
    if (
      !isUuid(owner.id) ||
      owner.active !== true ||
      !['admin_sekolah', 'operator', 'guru'].includes(owner.role) ||
      typeof owner.tenant_id !== 'string' ||
      !owner.tenant_id
    ) {
      quarantine('active_teacher_profile_not_verified');
      continue;
    }
    const tenantMatches = tenantsById.get(owner.tenant_id) ?? [];
    if (tenantMatches.length !== 1 || tenantMatches[0].active !== true) {
      quarantine('active_target_tenant_not_verified');
      continue;
    }
    const entitlementMatches = entitlementsByTenant.get(owner.tenant_id) ?? [];
    const entitled = entitlementMatches.filter(entitlement =>
      ['trial', 'active'].includes(entitlement.status) &&
      (!entitlement.valid_until || Date.parse(entitlement.valid_until) > Date.parse(reconciledAt)),
    );
    if (entitlementMatches.length !== 1 || entitled.length !== 1) {
      quarantine('active_target_tenant_entitlement_not_verified');
      continue;
    }

    const proposal = {
      id: normalized.id,
      tenant_id: owner.tenant_id,
      owner_id: owner.id,
      nama: normalized.nama,
      kelas: normalized.kelas,
      nisn: normalized.nisn,
      jk: normalized.jk,
      kode_unik: normalized.kode_unik,
      created_at: normalized.created_at,
      updated_at: normalized.updated_at,
    };
    const targetIdMatches = targetById.get(proposal.id) ?? [];
    if (targetIdMatches.length > 1) {
      quarantine('target_student_id_not_unique');
      continue;
    }
    if (targetIdMatches.length === 1) {
      if (sameStudent(targetIdMatches[0], proposal)) {
        alreadyPresent.push(proposal.id);
      } else {
        quarantine('target_student_id_metadata_conflict');
      }
      continue;
    }
    if (targetIdSeen.has(proposal.id)) {
      quarantine('duplicate_target_student_id');
      continue;
    }
    const codeMatches = targetByCode.get(proposal.kode_unik) ?? [];
    if (codeMatches.length > 0) {
      quarantine('target_student_code_conflict');
      continue;
    }
    if (proposal.nisn) {
      const nisnMatches = targetByOwnerNisn.get(`${proposal.owner_id}/${proposal.nisn}`) ?? [];
      if (nisnMatches.length > 0) {
        quarantine('target_student_nisn_conflict');
        continue;
      }
    }
    targetIdSeen.add(proposal.id);
    proposals.push(proposal);
  }

  return {
    mode: 'report-only',
    summary: {
      sourceStudents: studentRecords.length,
      profiles: profiles.length,
      targetTenants: targetTenants.length,
      targetEntitlements: targetEntitlements.length,
      targetStudents: targetStudents.length,
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
    throw new Error('Usage: node scripts/reconcileStudents.mjs <local-minimal-input.json>');
  }
  const report = reconcileStudents(JSON.parse(await readFile(inputPath, 'utf8')));
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
