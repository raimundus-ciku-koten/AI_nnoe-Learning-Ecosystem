import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileStudents } from '../../scripts/reconcileStudents.mjs';

const ownerId = '11111111-1111-4111-8111-111111111111';

const makeInput = overrides => ({
  studentRecords: [{
    ownerUid: 'legacy-teacher',
    documentId: 'doc-1',
    data: {
      nama: '  Siswa   Contoh  ',
      kelas: ' X-A ',
      nisn: '1234567890',
      jk: 'L',
      kodeUnik: 'ALE-0123456789ABCDEF0123456789ABCDEF',
      dibuat: '2025-12-01T00:00:00Z',
      diperbarui: '2026-01-03T00:00:00Z',
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
  targetEntitlements: [{
    tenant_id: 'school-target',
    status: 'trial',
    valid_until: null,
  }],
  targetStudents: [],
  reconciledAt: '2026-02-01T00:00:00Z',
  ...overrides,
});

test('maps owner-scoped student data and preserves its opaque QR token', () => {
  const report = reconcileStudents(makeInput());
  const proposal = report.proposals[0];
  assert.equal(report.mode, 'report-only');
  assert.equal(report.summary.proposals, 1);
  assert.equal(proposal.owner_id, ownerId);
  assert.equal(proposal.tenant_id, 'school-target');
  assert.equal(proposal.nama, 'Siswa Contoh');
  assert.equal(proposal.kelas, 'X-A');
  assert.equal(proposal.nisn, '1234567890');
  assert.equal(proposal.jk, 'L');
  assert.equal(proposal.kode_unik, 'ALE-0123456789ABCDEF0123456789ABCDEF');
  assert.equal(proposal.created_at, '2025-12-01T00:00:00.000Z');
  assert.equal(proposal.updated_at, '2026-01-03T00:00:00.000Z');
  assert.equal(JSON.stringify(report).includes('urlScan'), false);
});

test('quarantines a source student without a saved token instead of deriving one from personal data', () => {
  const input = makeInput();
  delete input.studentRecords[0].data.kodeUnik;
  const report = reconcileStudents(input);
  assert.equal(report.proposals.length, 0);
  assert.equal(report.quarantined[0].reason, 'source_student_code_missing');
});

test('normalizes empty nullable fields and uses import time when source creation time is absent', () => {
  const input = makeInput();
  input.studentRecords[0].data.nisn = '';
  input.studentRecords[0].data.jk = '';
  delete input.studentRecords[0].data.dibuat;
  const proposal = reconcileStudents(input).proposals[0];
  assert.equal(proposal.nisn, null);
  assert.equal(proposal.jk, null);
  assert.equal(proposal.created_at, '2026-02-01T00:00:00.000Z');
});

test('preserves a valid source code and quarantines malformed source data', () => {
  const validCode = makeInput();
  validCode.studentRecords[0].data.kodeUnik = 'ALE-XA-ABC123-0001';
  validCode.studentRecords[0].data.urlScan =
    'https://ainnoe.app/#/scan/ALE-XA-ABC123-0001';
  assert.equal(
    reconcileStudents(validCode).proposals[0].kode_unik,
    'ALE-XA-ABC123-0001',
  );

  const badCode = makeInput();
  badCode.studentRecords[0].data.kodeUnik = 'bad';
  assert.equal(
    reconcileStudents(badCode).quarantined[0].reason,
    'source_student_code_invalid',
  );

  const badUrl = makeInput();
  badUrl.studentRecords[0].data.kodeUnik = 'ALE-XA-ABC123-0001';
  badUrl.studentRecords[0].data.urlScan = 'https://bad.example/scan/wrong';
  assert.equal(
    reconcileStudents(badUrl).quarantined[0].reason,
    'source_student_scan_url_invalid',
  );
});

test('requires valid student fields, dates and strict target-column values', () => {
  const missingName = makeInput();
  delete missingName.studentRecords[0].data.nama;
  assert.equal(
    reconcileStudents(missingName).quarantined[0].reason,
    'source_student_fields_invalid',
  );

  const invalidNisn = makeInput();
  invalidNisn.studentRecords[0].data.nisn = '12A';
  assert.equal(
    reconcileStudents(invalidNisn).quarantined[0].reason,
    'source_student_nisn_invalid',
  );

  const invalidJk = makeInput();
  invalidJk.studentRecords[0].data.jk = 'X';
  assert.equal(
    reconcileStudents(invalidJk).quarantined[0].reason,
    'source_student_gender_invalid',
  );

  const invalidDate = makeInput();
  invalidDate.studentRecords[0].data.diperbarui = 'not-a-date';
  assert.equal(
    reconcileStudents(invalidDate).quarantined[0].reason,
    'source_student_timestamp_invalid',
  );
});

test('requires active teacher, tenant and unexpired trial/active entitlement', () => {
  const inactiveTeacher = makeInput();
  inactiveTeacher.profiles[0].active = false;
  assert.equal(
    reconcileStudents(inactiveTeacher).quarantined[0].reason,
    'active_teacher_profile_not_verified',
  );

  const inactiveTenant = makeInput();
  inactiveTenant.targetTenants[0].active = false;
  assert.equal(
    reconcileStudents(inactiveTenant).quarantined[0].reason,
    'active_target_tenant_not_verified',
  );

  const noEntitlement = makeInput({ targetEntitlements: [] });
  assert.equal(
    reconcileStudents(noEntitlement).quarantined[0].reason,
    'active_target_tenant_entitlement_not_verified',
  );

  const expired = makeInput();
  expired.targetEntitlements[0].valid_until = '2026-01-31T00:00:00Z';
  assert.equal(
    reconcileStudents(expired).quarantined[0].reason,
    'active_target_tenant_entitlement_not_verified',
  );

  const adminOwner = makeInput();
  adminOwner.profiles[0].role = 'admin_sekolah';
  assert.equal(reconcileStudents(adminOwner).summary.proposals, 1);
});

test('quarantines duplicate codes and duplicate owner NISNs in source data', () => {
  const duplicateCode = makeInput();
  duplicateCode.studentRecords[0].data.kodeUnik = 'ALE-XA-SAME01-0001';
  duplicateCode.studentRecords.push({
    ...duplicateCode.studentRecords[0],
    documentId: 'doc-2',
    data: { ...duplicateCode.studentRecords[0].data },
  });
  const codeReport = reconcileStudents(duplicateCode);
  assert.equal(codeReport.summary.proposals, 0);
  assert.equal(codeReport.quarantined.length, 2);
  assert.ok(codeReport.quarantined.every(item => item.reason === 'duplicate_source_student_code'));

  const duplicateNisn = makeInput();
  duplicateNisn.studentRecords.push({
    ownerUid: 'legacy-teacher',
    documentId: 'doc-2',
    data: {
      ...duplicateNisn.studentRecords[0].data,
      nama: 'Siswa Lain',
      kodeUnik: 'ALE-XA-OTHER1-9999',
    },
  });
  assert.ok(
    reconcileStudents(duplicateNisn).quarantined
      .every(item => item.reason === 'duplicate_source_student_nisn'),
  );
});

test('is idempotent and rejects target code, NISN and metadata conflicts', () => {
  const proposal = reconcileStudents(makeInput()).proposals[0];
  const same = reconcileStudents(makeInput({
    targetStudents: [{ ...proposal }],
  }));
  assert.equal(same.summary.alreadyPresent, 1);

  const codeConflict = reconcileStudents(makeInput({
    targetStudents: [{ ...proposal, id: '22222222-2222-4222-8222-222222222222' }],
  }));
  assert.equal(codeConflict.quarantined[0].reason, 'target_student_code_conflict');

  const nisnConflict = reconcileStudents(makeInput({
    targetStudents: [{
      ...proposal,
      id: '22222222-2222-4222-8222-222222222222',
      kode_unik: 'ALE-XA-OTHER1-9999',
    }],
  }));
  assert.equal(nisnConflict.quarantined[0].reason, 'target_student_nisn_conflict');

  const idConflict = reconcileStudents(makeInput({
    targetStudents: [{ ...proposal, nama: 'Nama berbeda' }],
  }));
  assert.equal(idConflict.quarantined[0].reason, 'target_student_id_metadata_conflict');
});

test('requires schema arrays and an explicit reconciliation timestamp', () => {
  assert.throws(() => reconcileStudents({}), /must be an array/);
  assert.throws(() => reconcileStudents(makeInput({ reconciledAt: 'invalid' })), /reconciledAt/);
});
