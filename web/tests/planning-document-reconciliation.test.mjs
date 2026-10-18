import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcilePlanningDocuments } from '../../scripts/reconcilePlanningDocuments.mjs';

const ownerId = '11111111-1111-4111-8111-111111111111';
const adminId = '22222222-2222-4222-8222-222222222222';
const superadminId = '33333333-3333-4333-8333-333333333333';

const makeInput = overrides => ({
  planningDocuments: [{
    tenantId: 'legacy-school',
    ownerUid: 'legacy-teacher',
    packageId: 'package-1',
    documentId: 'rpe',
    data: {
      ownerUid: 'legacy-teacher',
      tenantId: 'legacy-school',
      paketId: 'package-1',
      jenis: 'rpe',
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
    sourceKey: 'legacy-school/legacy-teacher/package-1/rpe',
    ownerId,
    driveFileId: 'driveRpe123',
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

test('proposes encrypted planning document metadata with correct recipient access', () => {
  const report = reconcilePlanningDocuments(makeInput());
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

test('requires exact document schema, valid revision, type and timestamp ordering', () => {
  const extra = makeInput();
  extra.planningDocuments[0].data.unexpected = true;
  assert.equal(
    reconcilePlanningDocuments(extra).quarantined[0].reason,
    'source_document_fields_invalid',
  );

  const wrongKind = makeInput();
  wrongKind.planningDocuments[0].data.jenis = 'unsupported';
  assert.equal(
    reconcilePlanningDocuments(wrongKind).quarantined[0].reason,
    'source_document_fields_invalid',
  );

  const timeOrder = makeInput();
  timeOrder.planningDocuments[0].data.updatedAt = '2025-12-31T00:00:00Z';
  assert.equal(
    reconcilePlanningDocuments(timeOrder).quarantined[0].reason,
    'source_document_fields_invalid',
  );
});

test('requires parent package and source directory to match owner and tenant', () => {
  const missingParent = makeInput({ parentPackages: [] });
  assert.equal(
    reconcilePlanningDocuments(missingParent).quarantined[0].reason,
    'parent_planning_package_missing_or_ambiguous',
  );

  const mismatchedParent = makeInput();
  mismatchedParent.parentPackages[0].data.tenantId = 'different-school';
  assert.equal(
    reconcilePlanningDocuments(mismatchedParent).quarantined[0].reason,
    'parent_planning_package_mismatch',
  );

  const mismatchedDirectory = makeInput();
  mismatchedDirectory.directoryEntries[0].data.role = 'admin_sekolah';
  assert.equal(
    reconcilePlanningDocuments(mismatchedDirectory).quarantined[0].reason,
    'source_teacher_directory_mismatch',
  );
});

test('requires owner write and verified admin/superadmin read envelopes', () => {
  const missingAdmin = makeInput();
  missingAdmin.encryptedDriveFiles[0].recipients =
    missingAdmin.encryptedDriveFiles[0].recipients.filter(item => item.userId !== adminId);
  assert.equal(
    reconcilePlanningDocuments(missingAdmin).quarantined[0].reason,
    'planning_document_recipient_shares_incomplete',
  );

  const wrongAccess = makeInput();
  wrongAccess.encryptedDriveFiles[0].recipients[1].accessLevel = 'write';
  assert.equal(
    reconcilePlanningDocuments(wrongAccess).quarantined[0].reason,
    'planning_document_recipient_shares_invalid',
  );

  const missingDriveAcl = makeInput();
  missingDriveAcl.encryptedDriveFiles[0].recipients[2].drivePermissionVerified = false;
  assert.equal(
    reconcilePlanningDocuments(missingDriveAcl).quarantined[0].reason,
    'planning_document_recipient_shares_invalid',
  );
});

test('requires verified active owner/tenant and valid encrypted artifact', () => {
  const inactiveOwner = makeInput();
  inactiveOwner.profiles[0].active = false;
  assert.equal(
    reconcilePlanningDocuments(inactiveOwner).quarantined[0].reason,
    'owner_profile_not_verified_for_tenant',
  );

  const missingFile = reconcilePlanningDocuments(makeInput({ encryptedDriveFiles: [] }));
  assert.equal(
    missingFile.quarantined[0].reason,
    'encrypted_drive_file_missing_or_ambiguous',
  );

  const badSize = makeInput();
  badSize.encryptedDriveFiles[0].ciphertextSizeBytes = 10489857;
  assert.equal(
    reconcilePlanningDocuments(badSize).quarantined[0].reason,
    'encrypted_drive_file_metadata_invalid',
  );
});

test('is idempotent for matching target index and quarantines target conflicts', () => {
  const proposal = reconcilePlanningDocuments(makeInput()).proposals[0];
  const existing = reconcilePlanningDocuments(makeInput({
    targetDriveFiles: [{ ...proposal }],
  }));
  assert.equal(existing.summary.alreadyPresent, 1);

  const conflict = reconcilePlanningDocuments(makeInput({
    targetDriveFiles: [{ ...proposal, ciphertext_sha256: 'f'.repeat(64) }],
  }));
  assert.equal(conflict.quarantined[0].reason, 'target_drive_file_metadata_conflict');
});

test('requires all schema collections and a verified tenant crosswalk', () => {
  assert.throws(() => reconcilePlanningDocuments({}), /must be an array/);
  assert.throws(() => reconcilePlanningDocuments({
    planningDocuments: [],
    parentPackages: [],
    directoryEntries: [],
    profiles: [],
    targetTenants: [],
    encryptedDriveFiles: [],
    targetDriveFiles: [],
    tenantCrosswalk: [],
  }), /verified mapping object/);
});
