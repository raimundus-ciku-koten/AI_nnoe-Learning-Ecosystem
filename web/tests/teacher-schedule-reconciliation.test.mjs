import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileTeacherSchedule } from '../../scripts/reconcileTeacherSchedule.mjs';

const ownerId = '11111111-1111-4111-8111-111111111111';

const makeInput = overrides => ({
  scheduleDocuments: [{
    ownerUid: 'legacy-teacher',
    documentId: 'jadwal',
    data: {
      entri: [{
        id: 'lesson-1',
        hari: 1,
        mulai: '07:00',
        selesai: '07:40',
        kelas: 'X-A',
        mapel: 'Matematika',
      }],
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
  targetEntitlements: [{ tenant_id: 'school-target', status: 'active', valid_until: null }],
  encryptedDriveFiles: [{
    sourceKey: 'legacy-teacher/pengaturan/jadwal',
    ownerId,
    driveFileId: 'encryptedSchedule123',
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

test('proposes owner-only encrypted schedule metadata without exposing sessions', () => {
  const report = reconcileTeacherSchedule(makeInput());
  assert.equal(report.mode, 'report-only');
  assert.equal(report.summary.proposals, 1);
  assert.equal(report.proposals[0].owner_id, ownerId);
  assert.equal(report.proposals[0].tenant_id, 'school-target');
  assert.equal(report.proposals[0].category, 'other');
  assert.equal(report.proposals[0].created_at, '2026-02-01T00:00:00.000Z');
  assert.equal(report.proposals[0].updated_at, '2026-01-03T00:00:00.000Z');
  assert.equal(JSON.stringify(report).includes('Matematika'), false);
  assert.equal(JSON.stringify(report).includes('lesson-1'), false);
});

test('quarantines the entire document when active schedule normalization drops a session', () => {
  const invalidSession = makeInput();
  invalidSession.scheduleDocuments[0].data.entri.push({
    id: 'invalid-lesson',
    hari: 8,
    mulai: '07:00',
    selesai: '06:00',
    kelas: '',
    mapel: '',
  });
  assert.equal(
    reconcileTeacherSchedule(invalidSession).quarantined[0].reason,
    'source_schedule_contains_invalid_sessions',
  );
});

test('normalizes valid entries using the active app helper and preserves conflicts', () => {
  const normalized = makeInput();
  normalized.scheduleDocuments[0].data.entri = [
    {
      id: 'one',
      hari: '1',
      mulai: '07:00',
      selesai: '08:00',
      kelas: '  X-A  ',
      mapel: ' Matematika ',
      ignored: true,
    },
    {
      id: 'two',
      hari: 1,
      mulai: '07:30',
      selesai: '08:30',
      kelas: 'X-A',
      mapel: 'Matematika',
    },
  ];
  assert.equal(reconcileTeacherSchedule(normalized).summary.proposals, 1);
});

test('requires exact schedule document schema, identity and size limits', () => {
  const wrongPath = makeInput();
  wrongPath.scheduleDocuments[0].documentId = 'jadwal-lama';
  assert.equal(
    reconcileTeacherSchedule(wrongPath).quarantined[0].reason,
    'source_schedule_path_invalid',
  );

  const extraField = makeInput();
  extraField.scheduleDocuments[0].data.extra = true;
  assert.equal(
    reconcileTeacherSchedule(extraField).quarantined[0].reason,
    'source_schedule_fields_invalid',
  );

  const tooMany = makeInput();
  tooMany.scheduleDocuments[0].data.entri = Array.from({ length: 101 }, (_, index) => ({
    id: String(index),
    hari: 1,
    mulai: `${String(7 + Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}`,
    selesai: `${String(7 + Math.floor(index / 60)).padStart(2, '0')}:${String((index % 60) + 1).padStart(2, '0')}`,
    kelas: 'X-A',
    mapel: 'Matematika',
  }));
  assert.equal(
    reconcileTeacherSchedule(tooMany).quarantined[0].reason,
    'source_schedule_fields_invalid',
  );
});

test('requires active owner, tenant and unexpired tenant entitlement', () => {
  const inactiveOwner = makeInput();
  inactiveOwner.profiles[0].active = false;
  assert.equal(
    reconcileTeacherSchedule(inactiveOwner).quarantined[0].reason,
    'active_owner_profile_not_verified',
  );

  const inactiveTenant = makeInput();
  inactiveTenant.targetTenants[0].active = false;
  assert.equal(
    reconcileTeacherSchedule(inactiveTenant).quarantined[0].reason,
    'active_target_tenant_not_verified',
  );

  const noEntitlement = makeInput({ targetEntitlements: [] });
  assert.equal(
    reconcileTeacherSchedule(noEntitlement).quarantined[0].reason,
    'active_target_tenant_entitlement_not_verified',
  );
});

test('requires a single owner envelope and rejects shared recipients', () => {
  const noEnvelope = makeInput();
  noEnvelope.encryptedDriveFiles[0].recipients = [];
  assert.equal(
    reconcileTeacherSchedule(noEnvelope).quarantined[0].reason,
    'owner_encrypted_drive_file_metadata_invalid',
  );

  const extraRecipient = makeInput();
  extraRecipient.encryptedDriveFiles[0].recipients.push({
    ...extraRecipient.encryptedDriveFiles[0].recipients[0],
    userId: '22222222-2222-4222-8222-222222222222',
  });
  assert.equal(
    reconcileTeacherSchedule(extraRecipient).quarantined[0].reason,
    'owner_encrypted_drive_file_metadata_invalid',
  );
});

test('is idempotent and quarantines target metadata conflicts', () => {
  const proposal = reconcileTeacherSchedule(makeInput()).proposals[0];
  const same = reconcileTeacherSchedule(makeInput({
    targetDriveFiles: [{ ...proposal }],
  }));
  assert.equal(same.summary.alreadyPresent, 1);

  const conflict = reconcileTeacherSchedule(makeInput({
    targetDriveFiles: [{ ...proposal, ciphertext_sha256: 'f'.repeat(64) }],
  }));
  assert.equal(conflict.quarantined[0].reason, 'target_drive_file_metadata_conflict');
});

test('requires schema arrays and an explicit import timestamp', () => {
  assert.throws(() => reconcileTeacherSchedule({}), /must be an array/);
  assert.throws(() => reconcileTeacherSchedule(makeInput({ reconciledAt: 'invalid' })), /reconciledAt/);
});
