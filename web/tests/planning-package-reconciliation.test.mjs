import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcilePlanningPackages } from '../../scripts/reconcilePlanningPackages.mjs';

const ownerId = '11111111-1111-4111-8111-111111111111';
const adminId = '22222222-2222-4222-8222-222222222222';
const superadminId = '33333333-3333-4333-8333-333333333333';

const makeInput = overrides => ({
  planningPackages: [{
    tenantId: 'legacy-school',
    ownerUid: 'legacy-teacher',
    packageId: 'package-1',
    data: {
      mapel: 'Matematika',
      kelas: 'X Fase E',
      fase: 'E',
      tahunAjaran: '2026/2027',
      jpPerPekan: 4,
      totalJP: 144,
      hariPembelajaran: ['Senin', 'Rabu'],
      ganjil: { unit: 1 },
      genap: { unit: 2 },
      kalender: [{ week: 1 }],
      identitas: { guru: 'Nama Guru' },
      ownerUid: 'legacy-teacher',
      tenantId: 'legacy-school',
      schemaVersion: 1,
      rev: 2,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
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
    {
      id: '44444444-4444-4444-8444-444444444444',
      role: 'guru',
      tenant_id: 'school-target',
      active: true,
    },
  ],
  tenantCrosswalk: { 'legacy-school': 'school-target' },
  targetTenants: [{ id: 'school-target', active: true }],
  encryptedDriveFiles: [{
    sourceKey: 'legacy-school/legacy-teacher/package-1',
    ownerId,
    driveFileId: 'drivePackage123',
    ciphertextSha256: 'a'.repeat(64),
    ciphertextSizeBytes: 4096,
    encryptionVersion: 1,
    recipients: [
      {
        userId: ownerId,
        accessLevel: 'read',
        keyFingerprint: 'b'.repeat(64),
        keyVersion: 1,
        wrappedDataKey: 'w'.repeat(64),
        drivePermissionVerified: false,
      },
      {
        userId: adminId,
        accessLevel: 'write',
        keyFingerprint: 'c'.repeat(64),
        keyVersion: 1,
        wrappedDataKey: 'x'.repeat(64),
        drivePermissionVerified: true,
      },
      {
        userId: superadminId,
        accessLevel: 'write',
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

test('proposes planning file index only with owner, admin and superadmin sharing verified', () => {
  const report = reconcilePlanningPackages(makeInput());
  assert.equal(report.mode, 'report-only');
  assert.equal(report.summary.proposals, 1);
  assert.equal(report.proposals[0].owner_id, ownerId);
  assert.equal(report.proposals[0].tenant_id, 'school-target');
  assert.equal(report.proposals[0].category, 'planning');
  assert.equal(report.proposals[0].created_at, '2026-01-01T00:00:00.000Z');
  assert.equal(report.proposals[0].updated_at, '2026-01-02T00:00:00.000Z');
  assert.equal(JSON.stringify(report).includes('Nama Guru'), false);
  assert.equal(JSON.stringify(report).includes('Matematika'), false);
});

test('quarantines missing, extra or incorrect recipient access and envelopes', () => {
  const missingAdmin = makeInput();
  missingAdmin.encryptedDriveFiles[0].recipients =
    missingAdmin.encryptedDriveFiles[0].recipients.filter(item => item.userId !== adminId);
  assert.equal(
    reconcilePlanningPackages(missingAdmin).quarantined[0].reason,
    'planning_package_recipient_shares_incomplete',
  );

  const wrongAccess = makeInput();
  wrongAccess.encryptedDriveFiles[0].recipients[1].accessLevel = 'read';
  assert.equal(
    reconcilePlanningPackages(wrongAccess).quarantined[0].reason,
    'planning_package_recipient_shares_invalid',
  );

  const unverifiedDriveAcl = makeInput();
  unverifiedDriveAcl.encryptedDriveFiles[0].recipients[1].drivePermissionVerified = false;
  assert.equal(
    reconcilePlanningPackages(unverifiedDriveAcl).quarantined[0].reason,
    'planning_package_recipient_shares_invalid',
  );
});

test('quarantines malformed source package fields and owner/tenant mismatches', () => {
  const badVersion = makeInput();
  badVersion.planningPackages[0].data.schemaVersion = 2;
  assert.equal(
    reconcilePlanningPackages(badVersion).quarantined[0].reason,
    'source_package_fields_invalid',
  );

  const badRevision = makeInput();
  badRevision.planningPackages[0].data.rev = 0;
  assert.equal(
    reconcilePlanningPackages(badRevision).quarantined[0].reason,
    'source_package_fields_invalid',
  );

  const wrongOwner = makeInput();
  wrongOwner.planningPackages[0].data.ownerUid = 'other-owner';
  assert.equal(
    reconcilePlanningPackages(wrongOwner).quarantined[0].reason,
    'source_package_fields_invalid',
  );
});

test('requires verified tenant, active owner profile and one encrypted Drive file', () => {
  const noTenant = reconcilePlanningPackages(makeInput({ tenantCrosswalk: {} }));
  assert.equal(noTenant.quarantined[0].reason, 'verified_tenant_crosswalk_missing');

  const inactiveOwner = makeInput();
  inactiveOwner.profiles[0].active = false;
  assert.equal(
    reconcilePlanningPackages(inactiveOwner).quarantined[0].reason,
    'owner_profile_not_verified_for_tenant',
  );

  const noEncryptedFile = reconcilePlanningPackages(makeInput({ encryptedDriveFiles: [] }));
  assert.equal(
    noEncryptedFile.quarantined[0].reason,
    'encrypted_drive_file_missing_or_ambiguous',
  );
});

test('requires a unique source directory row consistent with package ownership', () => {
  const missing = makeInput({ directoryEntries: [] });
  assert.equal(
    reconcilePlanningPackages(missing).quarantined[0].reason,
    'source_teacher_directory_missing_or_ambiguous',
  );

  const wrongTenant = makeInput();
  wrongTenant.directoryEntries[0].data.tenantId = 'different-school';
  assert.equal(
    reconcilePlanningPackages(wrongTenant).quarantined[0].reason,
    'source_teacher_directory_mismatch',
  );
});

test('limits recipient count and validates optional totalJP', () => {
  const invalidTotal = makeInput();
  invalidTotal.planningPackages[0].data.totalJP = 700;
  assert.equal(
    reconcilePlanningPackages(invalidTotal).quarantined[0].reason,
    'source_package_total_jp_invalid',
  );

  const manyAdmins = makeInput();
  manyAdmins.profiles.push(...Array.from({ length: 98 }, (_, index) => ({
    id: `${String(index + 10).padStart(8, '0')}-4444-4444-8444-444444444444`,
    role: 'superadmin',
    tenant_id: null,
    active: true,
  })));
  assert.equal(
    reconcilePlanningPackages(manyAdmins).quarantined[0].reason,
    'planning_package_recipient_limit_exceeded',
  );
});

test('is idempotent for existing index rows and quarantines metadata collisions', () => {
  const proposal = reconcilePlanningPackages(makeInput()).proposals[0];
  const existing = reconcilePlanningPackages(makeInput({
    targetDriveFiles: [{ ...proposal }],
  }));
  assert.equal(existing.summary.alreadyPresent, 1);
  assert.equal(existing.summary.proposals, 0);

  const conflict = reconcilePlanningPackages(makeInput({
    targetDriveFiles: [{ ...proposal, ciphertext_sha256: 'f'.repeat(64) }],
  }));
  assert.equal(conflict.quarantined[0].reason, 'target_drive_file_metadata_conflict');
});

test('requires schema arrays and verified tenant crosswalk input', () => {
  assert.throws(() => reconcilePlanningPackages({}), /must be an array/);
  assert.throws(() => reconcilePlanningPackages({
    planningPackages: [],
    directoryEntries: [],
    profiles: [],
    targetTenants: [],
    encryptedDriveFiles: [],
    targetDriveFiles: [],
    tenantCrosswalk: [],
  }), /verified mapping object/);
});
