import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { kodeSiswaValid } from '../web/src/pages/dataDasar/kodeSiswa.js';

const UUID_NAMESPACE = 'd3062e52-1553-5c34-8ab1-e65e44307e22';
const STUDENT_UUID_NAMESPACE = '3957e3cb-9a84-5f63-8d5e-f161cd62c990';
const ATTENDANCE_FIELDS = [
  'siswaId',
  'tanggal',
  'status',
  'metode',
  'kodeUnik',
  'nama',
  'kelas',
  'waktu',
];
const OWNER_ROLES = ['admin_sekolah', 'operator', 'guru', 'demo'];

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

const deterministicUuid = (namespaceUuid, sourceKey) => {
  const namespace = Buffer.from(namespaceUuid.replaceAll('-', ''), 'hex');
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

const validDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const normalizeText = value => value.replace(/\s+/g, ' ').trim();

const sourceKeyFor = (ownerUid, attendanceDocumentId) =>
  `${ownerUid}/absensi/${attendanceDocumentId}`;

const deterministicStudentId = (ownerUid, sourceStudentId) =>
  deterministicUuid(
    STUDENT_UUID_NAMESPACE,
    `${ownerUid}/siswa/${sourceStudentId}`,
  );

const validAttendanceSource = (entry, ownerUid, attendanceDocumentId) => {
  const data = entry.data;
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    Object.keys(data).sort().join(',') !== [...ATTENDANCE_FIELDS].sort().join(',')
  ) {
    return 'source_attendance_fields_invalid';
  }
  if (
    typeof data.siswaId !== 'string' ||
    data.siswaId.length < 1 ||
    data.siswaId.includes('/') ||
    !validDate(data.tanggal) ||
    attendanceDocumentId !== `${data.tanggal}_${data.siswaId}` ||
    data.status !== 'hadir' ||
    data.metode !== 'scan' ||
    typeof data.kodeUnik !== 'string' ||
    data.kodeUnik.length > 64 ||
    typeof data.nama !== 'string' ||
    data.nama.length > 200 ||
    typeof data.kelas !== 'string' ||
    data.kelas.length > 50 ||
    !isValidIsoTimestamp(data.waktu) ||
    typeof ownerUid !== 'string' ||
    ownerUid.length < 1
  ) {
    return 'source_attendance_fields_invalid';
  }
  return null;
};

const validateInput = input => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Input must be a JSON object.');
  }
  for (const field of [
    'attendanceRecords',
    'profiles',
    'targetTenants',
    'targetEntitlements',
    'targetStudents',
    'targetAttendanceRecords',
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

const sameAttendance = (existing, proposal) =>
  existing.id === proposal.id &&
  existing.tenant_id === proposal.tenant_id &&
  existing.owner_id === proposal.owner_id &&
  existing.student_id === proposal.student_id &&
  existing.tanggal === proposal.tanggal &&
  existing.status === proposal.status &&
  existing.metode === proposal.metode &&
  existing.kode_unik === proposal.kode_unik &&
  existing.nama === proposal.nama &&
  existing.kelas === proposal.kelas &&
  Date.parse(existing.waktu) === Date.parse(proposal.waktu);

export function reconcileAttendance(input) {
  const {
    attendanceRecords,
    profiles,
    targetTenants,
    targetEntitlements,
    targetStudents,
    targetAttendanceRecords,
    reconciledAt,
  } = validateInput(input);
  const sourceByKey = indexBy(attendanceRecords, entry =>
    typeof entry?.ownerUid === 'string' && typeof entry?.documentId === 'string'
      ? sourceKeyFor(entry.ownerUid.trim(), entry.documentId)
      : null,
  );
  const profilesByLegacyUid = indexBy(profiles, profile => profile?.legacy_uid);
  const tenantsById = indexBy(targetTenants, tenant => tenant?.id);
  const entitlementsByTenant = indexBy(targetEntitlements, entitlement => entitlement?.tenant_id);
  const studentsById = indexBy(targetStudents, student => student?.id);
  const targetAttendanceById = indexBy(
    targetAttendanceRecords,
    attendance => attendance?.id,
  );
  const targetAttendanceByNaturalKey = indexBy(
    targetAttendanceRecords,
    attendance => attendance?.student_id
      ? `${attendance.tenant_id}/${attendance.owner_id}/${attendance.tanggal}/${attendance.student_id}`
      : null,
  );
  const candidates = [];
  const quarantined = [];
  const quarantine = reason => quarantined.push({ reason });

  for (const entry of attendanceRecords) {
    const ownerUid = typeof entry?.ownerUid === 'string' ? entry.ownerUid.trim() : '';
    const documentId = typeof entry?.documentId === 'string' ? entry.documentId : '';
    if (!ownerUid || !documentId || documentId.includes('/')) {
      quarantine('source_path_or_attendance_id_invalid');
      continue;
    }
    const sourceKey = sourceKeyFor(ownerUid, documentId);
    if ((sourceByKey.get(sourceKey) ?? []).length !== 1) {
      quarantine('source_attendance_not_unique');
      continue;
    }
    const invalidSource = validAttendanceSource(entry, ownerUid, documentId);
    if (invalidSource) {
      quarantine(invalidSource);
      continue;
    }

    const profileMatches = profilesByLegacyUid.get(ownerUid) ?? [];
    if (profileMatches.length !== 1) {
      quarantine('owner_legacy_uid_not_unique');
      continue;
    }
    const owner = profileMatches[0];
    if (
      !isUuid(owner.id) ||
      owner.active !== true ||
      !OWNER_ROLES.includes(owner.role) ||
      typeof owner.tenant_id !== 'string' ||
      !owner.tenant_id
    ) {
      quarantine('active_owner_profile_not_verified');
      continue;
    }
    const tenantMatches = tenantsById.get(owner.tenant_id) ?? [];
    if (tenantMatches.length !== 1 || tenantMatches[0].active !== true) {
      quarantine('active_target_tenant_not_verified');
      continue;
    }
    const entitlementMatches = entitlementsByTenant.get(owner.tenant_id) ?? [];
    const validEntitlements = entitlementMatches.filter(entitlement =>
      ['trial', 'active'].includes(entitlement.status) &&
      (!entitlement.valid_until || Date.parse(entitlement.valid_until) > Date.parse(reconciledAt)),
    );
    if (entitlementMatches.length !== 1 || validEntitlements.length !== 1) {
      quarantine('active_target_tenant_entitlement_not_verified');
      continue;
    }

    const sourceStudentId = entry.data.siswaId;
    const studentId = deterministicStudentId(ownerUid, sourceStudentId);
    const studentMatches = studentsById.get(studentId) ?? [];
    if (studentMatches.length !== 1) {
      quarantine('target_student_missing_or_ambiguous');
      continue;
    }
    const student = studentMatches[0];
    const kodeUnik = entry.data.kodeUnik.trim();
    const nama = normalizeText(entry.data.nama);
    const kelas = normalizeText(entry.data.kelas);
    if (
      student.owner_id !== owner.id ||
      student.tenant_id !== owner.tenant_id ||
      student.kode_unik !== kodeUnik ||
      student.nama !== nama ||
      student.kelas !== kelas ||
      !kodeSiswaValid(kodeUnik)
    ) {
      quarantine('attendance_student_snapshot_mismatch');
      continue;
    }

    candidates.push({
      id: deterministicUuid(UUID_NAMESPACE, sourceKey),
      tenant_id: owner.tenant_id,
      owner_id: owner.id,
      student_id: student.id,
      tanggal: entry.data.tanggal,
      status: 'hadir',
      metode: 'scan',
      kode_unik: kodeUnik,
      nama,
      kelas,
      waktu: new Date(entry.data.waktu).toISOString(),
    });
  }

  const naturalKeyCounts = indexBy(
    candidates,
    attendance =>
      `${attendance.tenant_id}/${attendance.owner_id}/${attendance.tanggal}/${attendance.student_id}`,
  );
  const proposals = [];
  const alreadyPresent = [];
  const targetIdsSeen = new Set();
  for (const proposal of candidates) {
    const naturalKey =
      `${proposal.tenant_id}/${proposal.owner_id}/${proposal.tanggal}/${proposal.student_id}`;
    if ((naturalKeyCounts.get(naturalKey) ?? []).length > 1) {
      quarantine('duplicate_source_attendance_day');
      continue;
    }
    const targetIdMatches = targetAttendanceById.get(proposal.id) ?? [];
    if (targetIdMatches.length > 1) {
      quarantine('target_attendance_id_not_unique');
      continue;
    }
    if (targetIdMatches.length === 1) {
      if (sameAttendance(targetIdMatches[0], proposal)) {
        alreadyPresent.push(proposal.id);
      } else {
        quarantine('target_attendance_id_metadata_conflict');
      }
      continue;
    }
    if (targetIdsSeen.has(proposal.id)) {
      quarantine('duplicate_target_attendance_id');
      continue;
    }
    const naturalKeyMatches = targetAttendanceByNaturalKey.get(naturalKey) ?? [];
    if (naturalKeyMatches.length > 0) {
      quarantine('target_attendance_day_conflict');
      continue;
    }
    targetIdsSeen.add(proposal.id);
    proposals.push(proposal);
  }

  return {
    mode: 'report-only',
    summary: {
      sourceAttendanceRecords: attendanceRecords.length,
      profiles: profiles.length,
      targetTenants: targetTenants.length,
      targetEntitlements: targetEntitlements.length,
      targetStudents: targetStudents.length,
      targetAttendanceRecords: targetAttendanceRecords.length,
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
    throw new Error('Usage: node scripts/reconcileAttendance.mjs <local-minimal-input.json>');
  }
  const report = reconcileAttendance(JSON.parse(await readFile(inputPath, 'utf8')));
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
