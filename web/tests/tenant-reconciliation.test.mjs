import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileTenants } from '../../scripts/reconcileTenants.mjs';

const makeInput = overrides => ({
  firestoreTenants: [{
    documentId: 'legacy-school',
    data: {
      createdAt: '2026-01-01T00:00:00Z',
      jenjang: 'SMA',
      nama: 'Sekolah',
      namaSekolah: 'Sekolah',
    },
  }],
  tenantCrosswalk: { 'legacy-school': 'school-uuid' },
  targetTenants: [{
    id: 'school-uuid',
    name: 'Sekolah',
    active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }],
  tenantReferences: ['school-uuid'],
  ...overrides,
});

test('matches an existing tenant through an explicit crosswalk without proposing writes', () => {
  const report = reconcileTenants(makeInput());
  assert.equal(report.mode, 'report-only');
  assert.equal(report.summary.matchedExisting, 1);
  assert.equal(report.summary.pendingCreation, 0);
  assert.equal(report.quarantined.length, 0);
});

test('quarantines conflicting source name aliases', () => {
  const input = makeInput({
    firestoreTenants: [{
      ...makeInput().firestoreTenants[0],
      data: {
        ...makeInput().firestoreTenants[0].data,
        namaSekolah: 'Nama berbeda',
      },
    }],
  });
  const report = reconcileTenants(input);
  assert.equal(report.quarantined[0].reason, 'school_name_fields_conflict');
});

test('quarantines invalid name types and standardized null-like names', () => {
  const invalidType = reconcileTenants(makeInput({
    firestoreTenants: [{
      ...makeInput().firestoreTenants[0],
      data: { ...makeInput().firestoreTenants[0].data, namaSekolah: 42 },
    }],
  }));
  assert.equal(invalidType.quarantined[0].reason, 'school_name_type_invalid');

  const nullName = reconcileTenants(makeInput({
    firestoreTenants: [{
      ...makeInput().firestoreTenants[0],
      data: {
        ...makeInput().firestoreTenants[0].data,
        nama: 'N/A',
        namaSekolah: 'N/A',
      },
    }],
  }));
  assert.equal(nullName.quarantined[0].reason, 'school_name_missing_or_invalid');
});

test('does not create a tenant when the mapped target is missing or activation is unknown', () => {
  const input = makeInput({ targetTenants: [] });
  const report = reconcileTenants(input);
  assert.equal(report.summary.pendingCreation, 1);
  assert.equal(report.summary.matchedExisting, 0);
  assert.equal(report.observations[0].reason, 'new_tenant_requires_verified_active_status');
});

test('quarantines missing crosswalks and non-unique target mappings', () => {
  const missing = reconcileTenants(makeInput({ tenantCrosswalk: {} }));
  assert.equal(missing.quarantined[0].reason, 'verified_tenant_crosswalk_missing');

  const duplicate = reconcileTenants(makeInput({
    firestoreTenants: [
      ...makeInput().firestoreTenants,
      { documentId: 'legacy-school-2', data: makeInput().firestoreTenants[0].data },
    ],
    tenantCrosswalk: {
      'legacy-school': 'school-uuid',
      'legacy-school-2': 'school-uuid',
    },
  }));
  assert.equal(duplicate.quarantined[0].reason, 'tenant_crosswalk_target_not_unique');
});

test('validates required timestamps, tracks dangling references, and omits raw names', () => {
  const badTimestamp = reconcileTenants(makeInput({
    firestoreTenants: [{
      ...makeInput().firestoreTenants[0],
      data: { ...makeInput().firestoreTenants[0].data, createdAt: 'invalid' },
    }],
    tenantReferences: ['missing-target'],
  }));
  assert.equal(badTimestamp.quarantined[0].reason, 'created_at_missing_or_invalid');
  assert.equal(badTimestamp.observations[0].reason, 'target_tenant_reference_missing');
  assert.equal(JSON.stringify(badTimestamp).includes('Sekolah'), false);
});

test('requires schema arrays and a crosswalk object', () => {
  assert.throws(() => reconcileTenants({}), /must be an array/);
  assert.throws(
    () => reconcileTenants({ firestoreTenants: [], targetTenants: [], tenantCrosswalk: [] }),
    /verified mapping object/,
  );
});
