import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileTeacherWorkspace } from '../../scripts/reconcileTeacherWorkspace.mjs';

const makeInput = overrides => ({
  workspaceEntries: [{
    tenantId: 'legacy-school',
    ownerUid: 'legacy-teacher',
    entryId: 'entry-1',
    data: {
      ownerUid: 'legacy-teacher',
      modulePath: '/pelaksanaan/jurnal',
      moduleLabel: 'Jurnal',
      judul: 'Catatan mingguan',
      tanggal: '2026-01-02',
      kelas: 'X',
      mapel: 'Matematika',
      isi: 'Catatan tanpa data siswa.',
      status: 'draf',
      createdAt: '2026-01-02T10:00:00Z',
      updatedAt: '2026-01-02T11:00:00Z',
    },
  }],
  profiles: [{
    id: '11111111-1111-4111-8111-111111111111',
    legacy_uid: 'legacy-teacher',
    role: 'guru',
    tenant_id: 'school-target',
    active: true,
  }],
  tenantCrosswalk: { 'legacy-school': 'school-target' },
  tenantTargets: [{ id: 'school-target', active: true }],
  encryptedDriveFiles: [{
    sourceKey: 'legacy-school/legacy-teacher/entry-1',
    driveFileId: 'driveFile123',
    ciphertextSha256: 'a'.repeat(64),
    ciphertextSizeBytes: 2048,
    encryptionVersion: 1,
  }],
  targetDriveFiles: [],
  ...overrides,
});

test('proposes owner-only encrypted Drive metadata without plaintext fields', () => {
  const report = reconcileTeacherWorkspace(makeInput());
  assert.equal(report.mode, 'report-only');
  assert.equal(report.summary.proposals, 1);
  assert.deepEqual(report.proposals[0], {
    owner_id: '11111111-1111-4111-8111-111111111111',
    tenant_id: 'school-target',
    drive_file_id: 'driveFile123',
    category: 'other',
    ciphertext_sha256: 'a'.repeat(64),
    ciphertext_size_bytes: 2048,
    encryption_version: 1,
    created_at: '2026-01-02T10:00:00.000Z',
    updated_at: '2026-01-02T11:00:00.000Z',
    revoked_at: null,
  });
  assert.equal(JSON.stringify(report).includes('Catatan mingguan'), false);
  assert.equal(JSON.stringify(report).includes('Catatan tanpa data siswa.'), false);
  assert.equal(JSON.stringify(report).includes('legacy-teacher'), false);
});

test('quarantines path-owner mismatch, invalid data fields and malformed dates', () => {
  const ownerMismatch = makeInput();
  ownerMismatch.workspaceEntries[0].data.ownerUid = 'another-user';
  assert.equal(
    reconcileTeacherWorkspace(ownerMismatch).quarantined[0].reason,
    'source_owner_uid_mismatch',
  );

  const extraField = makeInput();
  extraField.workspaceEntries[0].data.privateNote = true;
  assert.equal(
    reconcileTeacherWorkspace(extraField).quarantined[0].reason,
    'source_entry_fields_invalid',
  );

  const invalidDate = makeInput();
  invalidDate.workspaceEntries[0].data.tanggal = '2026-02-30';
  assert.equal(
    reconcileTeacherWorkspace(invalidDate).quarantined[0].reason,
    'entry_date_invalid',
  );
});

test('requires unique active teacher and matching verified tenant', () => {
  const inactiveOwner = makeInput();
  inactiveOwner.profiles[0].active = false;
  assert.equal(
    reconcileTeacherWorkspace(inactiveOwner).quarantined[0].reason,
    'owner_profile_not_verified_for_tenant',
  );

  const wrongTenant = makeInput();
  wrongTenant.profiles[0].tenant_id = 'different-school';
  assert.equal(
    reconcileTeacherWorkspace(wrongTenant).quarantined[0].reason,
    'owner_profile_not_verified_for_tenant',
  );

  const duplicateOwner = makeInput();
  duplicateOwner.profiles.push({ ...duplicateOwner.profiles[0] });
  assert.equal(
    reconcileTeacherWorkspace(duplicateOwner).quarantined[0].reason,
    'owner_legacy_uid_not_unique',
  );
});

test('requires exactly one encrypted artifact with valid bounded metadata', () => {
  const missing = reconcileTeacherWorkspace(makeInput({ encryptedDriveFiles: [] }));
  assert.equal(
    missing.quarantined[0].reason,
    'encrypted_drive_file_missing_or_ambiguous',
  );

  const invalid = makeInput();
  invalid.encryptedDriveFiles[0].ciphertextSizeBytes = 10489857;
  assert.equal(
    reconcileTeacherWorkspace(invalid).quarantined[0].reason,
    'encrypted_drive_file_metadata_invalid',
  );
});

test('is idempotent for matching target index and quarantines metadata collisions', () => {
  const proposal = reconcileTeacherWorkspace(makeInput()).proposals[0];
  const existing = reconcileTeacherWorkspace(makeInput({
    targetDriveFiles: [{ ...proposal }],
  }));
  assert.equal(existing.summary.alreadyPresent, 1);
  assert.equal(existing.summary.proposals, 0);

  const conflict = reconcileTeacherWorkspace(makeInput({
    targetDriveFiles: [{ ...proposal, tenant_id: 'different-school' }],
  }));
  assert.equal(conflict.quarantined[0].reason, 'target_drive_file_metadata_conflict');
});

test('requires all source, target and crosswalk inputs', () => {
  assert.throws(() => reconcileTeacherWorkspace({}), /must be an array/);
  assert.throws(() => reconcileTeacherWorkspace({
    workspaceEntries: [],
    profiles: [],
    tenantTargets: [],
    encryptedDriveFiles: [],
    targetDriveFiles: [],
    tenantCrosswalk: [],
  }), /verified mapping object/);
});
