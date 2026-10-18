import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcilePlanningModules } from '../../scripts/reconcilePlanningModules.mjs';

const ownerId = '11111111-1111-4111-8111-111111111111';
const adminId = '22222222-2222-4222-8222-222222222222';
const superadminId = '33333333-3333-4333-8333-333333333333';

const makeInput = overrides => ({
  planningModules: [{
    tenantId: 'legacy-school',
    ownerUid: 'legacy-teacher',
    packageId: 'package-1',
    documentId: '5',
    data: {
      ownerUid: 'legacy-teacher',
      tenantId: 'legacy-school',
      paketId: 'package-1',
      jenis: 'modul',
      noUnit: 5,
      schemaVersion: 1,
      rev: 3,
      sumber: 'ai',
      sumberRev: { packageRev: 2 },
      payload: { sections: [{ heading: 'Tujuan' }] },
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-03T00:00:00Z',
    },
  }],
  parentPackages: [{
    tenantId: 'legacy-school',
    ownerUid: 'legacy-teacher',
    packageId: 'package-1',
    data: {
      ownerUid: 'legacy-teacher',
      tenantId: 'legacy-school',
      schemaVersion: 1,
    },
  }],
  directoryEntries: [{
    documentId: 'legacy-teacher',
    data: {
      uid: 'legacy-teacher',
      role: 'guru',
      tenantId: 'legacy-school',
    },
  }],
  profiles: [
    {
      id: ownerId,
      legacy_uid: 'legacy-teacher',
      role: 'guru',
      tenant_id: 'school-target',
      active: true,
    },
    { id: adminId, role: 'admin_sekolah', tenant_id: 'school-target', active: true },
    { id: superadminId, role: 'superadmin', tenant_id: null, active: true },
  ],
  tenantCrosswalk: { 'legacy-school': 'school-target' },
  targetTenants: [{ id: 'school-target', active: true }],
  encryptedDriveFiles: [{
    sourceKey: 'legacy-school/legacy-teacher/package-1/modul/5',
    ownerId,
    driveFileId: 'driveModul123',
    ciphertextSha256: 'a'.repeat(64),
    ciphertextSizeBytes: 4096,
    encryptionVersion: 1,
    recipients: [
      {
        userId: ownerId,
        accessLevel: 'write',
        keyFingerprint: 'b'.repeat(64),
        keyVersion: 1,
        wrappedDataKey: 'w'.repeat(64),
        drivePermissionVerified: false,
      },
      {
        userId: adminId,
        accessLevel: 'read',
        keyFingerprint: 'c'.repeat(64),
        keyVersion: 1,
        wrappedDataKey: 'x'.repeat(64),
        drivePermissionVerified: true,
      },
      {
        userId: superadminId,
        accessLevel: 'read',
        keyFingerprint: 'd'.repeat(64),
        keyVersion: 1,
        wrappedDataKey: 'y'.repeat(64),
        drivePermissionVerified: true,
      },
    ],
  }],
  targetDriveFiles: [],
  ...overrides,
});

test('proposes encrypted planning module with verified owner/admin access', () => {
  const report = reconcilePlanningModules(makeInput());
  assert.equal(report.mode, 'report-only');
  assert.equal(report.summary.proposals, 1);
  assert.equal(report.proposals[0].owner_id, ownerId);
  assert.equal(report.proposals[0].tenant_id, 'school-target');
  assert.equal(report.proposals[0].category, 'planning');
  assert.equal(report.proposals[0].created_at, '2026-01-01T00:00:00.000Z');
  assert.equal(report.proposals[0].updated_at, '2026-01-03T00:00:00.000Z');
  assert.equal(JSON.stringify(report).includes('Tujuan'), false);
  assert.equal(JSON.stringify(report).includes('legacy-teacher'), false);
});

test('quarantines module path/data ID mismatches and invalid unit bounds', () => {
  const mismatch = makeInput();
  mismatch.planningModules[0].data.noUnit = 6;
  assert.equal(
    reconcilePlanningModules(mismatch).quarantined[0].reason,
    'source_module_fields_invalid',
  );

  const badPath = makeInput();
  badPath.planningModules[0].documentId = '05';
  assert.equal(
    reconcilePlanningModules(badPath).quarantined[0].reason,
    'source_path_or_unit_number_invalid',
  );

  const badRange = makeInput();
  badRange.planningModules[0].data.noUnit = 31;
  assert.equal(
    reconcilePlanningModules(badRange).quarantined[0].reason,
    'source_module_fields_invalid',
  );
});

test('requires valid module schema, source and chronological timestamps', () => {
  const extra = makeInput();
  extra.planningModules[0].data.legacyContent = 'not allowed';
  assert.equal(
    reconcilePlanningModules(extra).quarantined[0].reason,
    'source_module_fields_invalid',
  );

  const badSource = makeInput();
  badSource.planningModules[0].data.sumber = 'import';
  assert.equal(
    reconcilePlanningModules(badSource).quarantined[0].reason,
    'source_module_fields_invalid',
  );

  const badDates = makeInput();
  badDates.planningModules[0].data.updatedAt = '2025-12-31T00:00:00Z';
  assert.equal(
    reconcilePlanningModules(badDates).quarantined[0].reason,
    'source_module_fields_invalid',
  );
});

test('requires matching parent package, teacher directory and target profile', () => {
  const missingParent = reconcilePlanningModules(makeInput({ parentPackages: [] }));
  assert.equal(
    missingParent.quarantined[0].reason,
    'parent_planning_package_missing_or_ambiguous',
  );

  const wrongTenant = makeInput();
  wrongTenant.directoryEntries[0].data.tenantId = 'different-school';
  assert.equal(
    reconcilePlanningModules(wrongTenant).quarantined[0].reason,
    'source_teacher_directory_mismatch',
  );

  const inactiveOwner = makeInput();
  inactiveOwner.profiles[0].active = false;
  assert.equal(
    reconcilePlanningModules(inactiveOwner).quarantined[0].reason,
    'owner_profile_not_verified_for_tenant',
  );
});

test('requires complete read envelopes and verified Drive permission for all staff', () => {
  const missingAdmin = makeInput();
  missingAdmin.encryptedDriveFiles[0].recipients =
    missingAdmin.encryptedDriveFiles[0].recipients.filter(item => item.userId !== adminId);
  assert.equal(
    reconcilePlanningModules(missingAdmin).quarantined[0].reason,
    'planning_module_recipient_shares_incomplete',
  );

  const wrongRole = makeInput();
  wrongRole.encryptedDriveFiles[0].recipients[1].accessLevel = 'write';
  assert.equal(
    reconcilePlanningModules(wrongRole).quarantined[0].reason,
    'planning_module_recipient_shares_invalid',
  );

  const missingPermission = makeInput();
  missingPermission.encryptedDriveFiles[0].recipients[2].drivePermissionVerified = false;
  assert.equal(
    reconcilePlanningModules(missingPermission).quarantined[0].reason,
    'planning_module_recipient_shares_invalid',
  );
});

test('is idempotent for matching target metadata and quarantines conflicts', () => {
  const proposal = reconcilePlanningModules(makeInput()).proposals[0];
  const same = reconcilePlanningModules(makeInput({
    targetDriveFiles: [{ ...proposal }],
  }));
  assert.equal(same.summary.alreadyPresent, 1);

  const conflict = reconcilePlanningModules(makeInput({
    targetDriveFiles: [{ ...proposal, ciphertext_sha256: 'f'.repeat(64) }],
  }));
  assert.equal(conflict.quarantined[0].reason, 'target_drive_file_metadata_conflict');
});

test('requires valid schema arrays and tenant crosswalk', () => {
  assert.throws(() => reconcilePlanningModules({}), /must be an array/);
  assert.throws(() => reconcilePlanningModules({
    planningModules: [],
    parentPackages: [],
    directoryEntries: [],
    profiles: [],
    targetTenants: [],
    encryptedDriveFiles: [],
    targetDriveFiles: [],
    tenantCrosswalk: [],
  }), /verified mapping object/);
});
