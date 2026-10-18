import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileTenantProfiles } from '../../scripts/reconcileTenantProfiles.mjs';

const makeInput = overrides => ({
  firestoreTenants: [{
    documentId: 'legacy-school',
    data: {
      createdAt: '2026-01-01T00:00:00Z',
      jenjang: 'SMA',
      nama: 'Sekolah',
      namaSekolah: 'Sekolah',
      npsn: '00123456',
      kepalaSekolah: 'Kepala Sekolah',
      nipKepalaSekolah: '19800101 200001 1 001',
      tahunAjaran: '2026/2027',
      semester: 'Genap',
      diperbaruiOleh: 'legacy-admin',
      waktuUbah: '2026-02-01T00:00:00Z',
    },
  }],
  tenantCrosswalk: { 'legacy-school': 'school-uuid' },
  profiles: [{
    id: '11111111-1111-4111-8111-111111111111',
    legacy_uid: 'legacy-admin',
  }],
  targetTenants: [{
    id: 'school-uuid',
    name: 'Sekolah',
    active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }],
  ...overrides,
});

test('maps verified tenant profile fields without changing activation state', () => {
  const report = reconcileTenantProfiles(makeInput());
  assert.equal(report.mode, 'report-only');
  assert.equal(report.summary.proposals, 1);
  assert.deepEqual(report.proposals[0], {
    id: 'school-uuid',
    fields: {
      education_level: 'SMA',
      npsn: '00123456',
      headmaster_name: 'Kepala Sekolah',
      headmaster_nip: '19800101 200001 1 001',
      academic_year: '2026/2027',
      semester: 'genap',
      updated_by: '11111111-1111-4111-8111-111111111111',
    },
  });
  assert.equal('active' in report.proposals[0].fields, false);
});

test('does not create a target tenant without verified activation status', () => {
  const report = reconcileTenantProfiles(makeInput({ targetTenants: [] }));
  assert.equal(report.summary.proposals, 0);
  assert.equal(
    report.quarantined[0].reason,
    'new_tenant_requires_verified_active_status',
  );
});

test('quarantines conflicting names, invalid NPSN and invalid academic year', () => {
  const conflictingNames = makeInput();
  conflictingNames.firestoreTenants[0].data.namaSekolah = 'Nama lain';
  assert.equal(
    reconcileTenantProfiles(conflictingNames).quarantined[0].reason,
    'school_name_fields_conflict',
  );

  const invalidNpsn = makeInput();
  invalidNpsn.firestoreTenants[0].data.npsn = '12A';
  assert.equal(
    reconcileTenantProfiles(invalidNpsn).quarantined[0].reason,
    'npsn_invalid',
  );

  const invalidYear = makeInput();
  invalidYear.firestoreTenants[0].data.tahunAjaran = '2026/2028';
  assert.equal(
    reconcileTenantProfiles(invalidYear).quarantined[0].reason,
    'tahunAjaran_invalid',
  );
});

test('treats optional empty fields as absent and preserves NPSN string semantics', () => {
  const input = makeInput();
  input.firestoreTenants[0].data.npsn = '';
  input.firestoreTenants[0].data.kepalaSekolah = ' N/A ';
  const report = reconcileTenantProfiles(input);
  assert.equal('npsn' in report.proposals[0].fields, false);
  assert.equal('headmaster_name' in report.proposals[0].fields, false);
  assert.equal(typeof report.proposals[0].fields.npsn, 'undefined');
});

test('does not propose an unlinked updater and reports a reason only', () => {
  const input = makeInput({ profiles: [] });
  const report = reconcileTenantProfiles(input);
  assert.equal('updated_by' in report.proposals[0].fields, false);
  assert.equal(report.observations[0].reason, 'updated_by_profile_unlinked');
  assert.equal(JSON.stringify(report).includes('legacy-admin'), false);
});

test('quarantines invalid timestamp ordering and retains existing target values', () => {
  const invalidTime = makeInput();
  invalidTime.firestoreTenants[0].data.waktuUbah = '2025-12-31T00:00:00Z';
  assert.equal(
    reconcileTenantProfiles(invalidTime).quarantined[0].reason,
    'updated_at_precedes_created_at',
  );

  const targetNameDiffers = makeInput();
  targetNameDiffers.targetTenants[0].name = 'Nama target';
  const report = reconcileTenantProfiles(targetNameDiffers);
  assert.equal(report.proposals.length, 1);
  assert.equal(report.observations[0].reason, 'source_identity_differs_target_preserved');
  assert.equal('name' in report.proposals[0].fields, false);
});

test('preserves populated target profile columns on a source conflict', () => {
  const input = makeInput();
  input.targetTenants[0].npsn = '00999999';
  const report = reconcileTenantProfiles(input);
  assert.equal('npsn' in report.proposals[0].fields, false);
  assert.ok(report.observations.some(
    observation => observation.reason === 'tenant_profile_field_conflict_preserved',
  ));
});

test('requires array inputs and verified tenant crosswalk', () => {
  assert.throws(() => reconcileTenantProfiles({}), /must be an array/);
  assert.throws(() => reconcileTenantProfiles({
    firestoreTenants: [],
    targetTenants: [],
    profiles: [],
    tenantCrosswalk: [],
  }), /verified mapping object/);
});
