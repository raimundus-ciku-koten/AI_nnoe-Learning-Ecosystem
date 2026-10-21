import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileTeacherSeating } from '../../scripts/reconcileTeacherSeating.mjs';

const ownerId = '11111111-1111-4111-8111-111111111111';

const makeInput = overrides => ({
  seatingPlans: [{
    ownerUid: 'legacy-teacher',
    documentId: 'class-x-a',
    data: {
      kelas: 'X-A',
      baris: 5,
      kolom: 6,
      kursi: { '1-1': 'Student A' },
      kelompok: { '1-1': 1 },
      jumlahKelompok: 4,
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
  encryptedDriveFiles: [{
    sourceKey: 'legacy-teacher/class-x-a',
    ownerId,
    driveFileId: 'encryptedSeating123',
    ciphertextSha256: 'a'.repeat(64),
    ciphertextSizeBytes: 2048,
    encryptionVersion: 1,
    recipients: [{
      userId: ownerId,
      accessLevel: 'write',
      keyFingerprint: 'b'.repeat(64),
      keyVersion: 1,
      wrappedDataKey: 'w'.repeat(64),
      drivePermissionVerified: false,
    }],
  }],
  targetDriveFiles: [],
  reconciledAt: '2026-02-01T00:00:00Z',
  ...overrides,
});

test('proposes owner-only encrypted seating metadata with import creation time', () => {
  const report = reconcileTeacherSeating(makeInput());
  assert.equal(report.mode, 'report-only');
  assert.equal(report.summary.proposals, 1);
  assert.equal(report.proposals[0].owner_id, ownerId);
  assert.equal(report.proposals[0].tenant_id, 'school-target');
  assert.equal(report.proposals[0].category, 'other');
  assert.equal(report.proposals[0].created_at, '2026-02-01T00:00:00.000Z');
  assert.equal(report.proposals[0].updated_at, '2026-01-03T00:00:00.000Z');
  assert.equal(JSON.stringify(report).includes('Student A'), false);
  assert.equal(JSON.stringify(report).includes('class-x-a'), false);
});

test('quarantines invalid seating dimensions, group counts and nested maps', () => {
  const badRows = makeInput();
  badRows.seatingPlans[0].data.baris = 11;
  assert.equal(
    reconcileTeacherSeating(badRows).quarantined[0].reason,
    'source_seating_fields_invalid',
  );

  const badGroups = makeInput();
  badGroups.seatingPlans[0].data.jumlahKelompok = 1;
  assert.equal(
    reconcileTeacherSeating(badGroups).quarantined[0].reason,
    'source_seating_fields_invalid',
  );

  const nonMap = makeInput();
  nonMap.seatingPlans[0].data.kursi = [];
  assert.equal(
    reconcileTeacherSeating(nonMap).quarantined[0].reason,
    'source_seating_fields_invalid',
  );
});

test('requires the unique active teacher and tenant profile', () => {
  const duplicateOwner = makeInput();
  duplicateOwner.profiles.push({ ...duplicateOwner.profiles[0] });
  assert.equal(
    reconcileTeacherSeating(duplicateOwner).quarantined[0].reason,
    'owner_legacy_uid_not_unique',
  );

  const inactive = makeInput();
  inactive.profiles[0].active = false;
  assert.equal(
    reconcileTeacherSeating(inactive).quarantined[0].reason,
    'owner_profile_not_verified',
  );

  const inactiveTenant = makeInput();
  inactiveTenant.targetTenants[0].active = false;
  assert.equal(
    reconcileTeacherSeating(inactiveTenant).quarantined[0].reason,
    'active_target_tenant_not_verified',
  );
});

test('requires a single owner envelope and no shared-recipient access', () => {
  const noEnvelope = makeInput();
  noEnvelope.encryptedDriveFiles[0].recipients = [];
  assert.equal(
    reconcileTeacherSeating(noEnvelope).quarantined[0].reason,
    'owner_encrypted_drive_file_metadata_invalid',
  );

  const extraRecipient = makeInput();
  extraRecipient.encryptedDriveFiles[0].recipients.push({
    ...extraRecipient.encryptedDriveFiles[0].recipients[0],
    userId: '22222222-2222-4222-8222-222222222222',
  });
  assert.equal(
    reconcileTeacherSeating(extraRecipient).quarantined[0].reason,
    'owner_encrypted_drive_file_metadata_invalid',
  );
});

test('requires an explicit reconciliation timestamp and unique source file', () => {
  assert.throws(() => reconcileTeacherSeating(makeInput({ reconciledAt: 'invalid' })), /reconciledAt/);

  const missingFile = reconcileTeacherSeating(makeInput({ encryptedDriveFiles: [] }));
  assert.equal(
    missingFile.quarantined[0].reason,
    'encrypted_drive_file_missing_or_ambiguous',
  );
});

test('is idempotent and quarantines target file metadata conflicts', () => {
  const proposal = reconcileTeacherSeating(makeInput()).proposals[0];
  const same = reconcileTeacherSeating(makeInput({
    targetDriveFiles: [{ ...proposal }],
  }));
  assert.equal(same.summary.alreadyPresent, 1);

  const conflict = reconcileTeacherSeating(makeInput({
    targetDriveFiles: [{ ...proposal, ciphertext_sha256: 'f'.repeat(64) }],
  }));
  assert.equal(conflict.quarantined[0].reason, 'target_drive_file_metadata_conflict');
});

test('requires all target input arrays', () => {
  assert.throws(() => reconcileTeacherSeating({}), /must be an array/);
});
