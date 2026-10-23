import { createHash } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileAttendance } from '../../scripts/reconcileAttendance.mjs';

const ownerId = '11111111-1111-4111-8111-111111111111';
const code = 'ALE-XA-ABC123-0001';
const studentName = 'Siswa Contoh';
const studentClass = 'X-A';

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
const targetStudentId = deterministicUuid(
  '3957e3cb-9a84-5f63-8d5e-f161cd62c990',
  'legacy-teacher/siswa/student-1',
);

const makeInput = overrides => ({
  attendanceRecords: [{
    ownerUid: 'legacy-teacher',
    documentId: '2026-01-03_student-1',
    data: {
      siswaId: 'student-1',
      tanggal: '2026-01-03',
      status: 'hadir',
      metode: 'scan',
      kodeUnik: code,
      nama: studentName,
      kelas: studentClass,
      waktu: '2026-01-03T08:00:00Z',
    },
  }],
  profiles: [{
    id: ownerId,
    legacy_uid: 'legacy-teacher',
    role: 'guru',
    tenant_id: 'school-target',
    active: true,
  }],
  targetTenants: [{ id: 'school-target', active: true }],
  targetStudents: [{
    id: targetStudentId,
    tenant_id: 'school-target',
    owner_id: ownerId,
    kode_unik: code,
    nama: studentName,
    kelas: studentClass,
  }],
  targetAttendanceRecords: [],
  reconciledAt: '2026-02-01T00:00:00Z',
  ...overrides,
});

test('maps immutable attendance with a deterministic student crosswalk', () => {
  const report = reconcileAttendance(makeInput());
  const proposal = report.proposals[0];
  assert.equal(report.mode, 'report-only');
  assert.equal(report.summary.proposals, 1);
  assert.equal(proposal.id, deterministicUuid(
    'd3062e52-1553-5c34-8ab1-e65e44307e22',
    'legacy-teacher/absensi/2026-01-03_student-1',
  ));
  assert.equal(proposal.student_id, targetStudentId);
  assert.equal(proposal.owner_id, ownerId);
  assert.equal(proposal.tenant_id, 'school-target');
  assert.equal(proposal.tanggal, '2026-01-03');
  assert.equal(proposal.status, 'hadir');
  assert.equal(proposal.metode, 'scan');
  assert.equal(proposal.waktu, '2026-01-03T08:00:00.000Z');
});

test('quarantines invalid path, calendar date, status, method and source schema', () => {
  const wrongPath = makeInput();
  wrongPath.attendanceRecords[0].documentId = 'another-id';
  assert.equal(
    reconcileAttendance(wrongPath).quarantined[0].reason,
    'source_attendance_fields_invalid',
  );

  const invalidDate = makeInput();
  invalidDate.attendanceRecords[0].data.tanggal = '2026-02-30';
  assert.equal(
    reconcileAttendance(invalidDate).quarantined[0].reason,
    'source_attendance_fields_invalid',
  );

  const wrongStatus = makeInput();
  wrongStatus.attendanceRecords[0].data.status = 'sakit';
  assert.equal(
    reconcileAttendance(wrongStatus).quarantined[0].reason,
    'source_attendance_fields_invalid',
  );

  const extraField = makeInput();
  extraField.attendanceRecords[0].data.extra = true;
  assert.equal(
    reconcileAttendance(extraField).quarantined[0].reason,
    'source_attendance_fields_invalid',
  );
});

test('requires exact target student identity and snapshot fields', () => {
  const missingStudent = reconcileAttendance(makeInput({ targetStudents: [] }));
  assert.equal(
    missingStudent.quarantined[0].reason,
    'target_student_missing_or_ambiguous',
  );

  const wrongSnapshot = makeInput();
  wrongSnapshot.targetStudents[0].nama = 'Nama Berbeda';
  assert.equal(
    reconcileAttendance(wrongSnapshot).quarantined[0].reason,
    'attendance_student_snapshot_mismatch',
  );

  const invalidCode = makeInput();
  invalidCode.attendanceRecords[0].data.kodeUnik = 'legacy-code';
  invalidCode.targetStudents[0].kode_unik = 'legacy-code';
  assert.equal(
    reconcileAttendance(invalidCode).quarantined[0].reason,
    'attendance_student_snapshot_mismatch',
  );
});

test('requires an active owner and tenant without subscription metadata', () => {
  const inactiveOwner = makeInput();
  inactiveOwner.profiles[0].active = false;
  assert.equal(
    reconcileAttendance(inactiveOwner).quarantined[0].reason,
    'active_owner_profile_not_verified',
  );

  const inactiveTenant = makeInput();
  inactiveTenant.targetTenants[0].active = false;
  assert.equal(
    reconcileAttendance(inactiveTenant).quarantined[0].reason,
    'active_target_tenant_not_verified',
  );

});

test('is idempotent and detects natural-key conflicts', () => {
  const proposal = reconcileAttendance(makeInput()).proposals[0];
  const existing = reconcileAttendance(makeInput({
    targetAttendanceRecords: [{ ...proposal }],
  }));
  assert.equal(existing.summary.alreadyPresent, 1);

  const conflict = reconcileAttendance(makeInput({
    targetAttendanceRecords: [{ ...proposal, nama: 'Nama Berbeda' }],
  }));
  assert.equal(conflict.quarantined[0].reason, 'target_attendance_id_metadata_conflict');

  const naturalConflict = reconcileAttendance(makeInput({
    targetAttendanceRecords: [{
      ...proposal,
      id: '22222222-2222-4222-8222-222222222222',
    }],
  }));
  assert.equal(naturalConflict.quarantined[0].reason, 'target_attendance_day_conflict');
});

test('requires explicit arrays and reconciliation timestamp', () => {
  assert.throws(() => reconcileAttendance({}), /must be an array/);
  assert.throws(() => reconcileAttendance(makeInput({ reconciledAt: 'bad' })), /reconciledAt/);
});
