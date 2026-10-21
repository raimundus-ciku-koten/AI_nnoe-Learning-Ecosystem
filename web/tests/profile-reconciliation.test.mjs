import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileProfiles } from '../../scripts/reconcileProfiles.mjs';

const makeInput = overrides => ({
  firebaseAuthUsers: [{
    uid: 'firebase-user-1',
    email: 'teacher@example.test',
    emailVerified: true,
    customClaims: { role: 'guru', tenantId: 'school-1' },
  }],
  firestoreUsers: [{
    documentId: 'firebase-user-1',
    data: {
      uid: 'firebase-user-1',
      email: 'TEACHER@example.test',
      nama: 'Teacher',
      role: 'guru',
      tenantId: 'school-1',
      aktif: true,
    },
  }],
  directory: [],
  supabaseUsers: [{
    id: '00000000-0000-4000-8000-000000000001',
    email: 'teacher@example.test',
    emailConfirmedAt: '2026-01-01T00:00:00Z',
  }],
  profiles: [{
    id: '00000000-0000-4000-8000-000000000001',
    email: 'teacher@example.test',
    nama: 'Teacher',
    role: 'guru',
    tenant_id: 'school-1',
    active: true,
    legacy_uid: null,
  }],
  ...overrides,
});

test('quarantines a missing crosswalk even when verified email matches', () => {
  const report = reconcileProfiles(makeInput());

  assert.equal(report.mode, 'report-only');
  assert.deepEqual(report.proposals, []);
  assert.equal(
    report.quarantined[0].reason,
    'supabase_legacy_uid_crosswalk_missing_requires_manual_review',
  );
});

test('quarantines unverified email and does not propose a link', () => {
  const input = makeInput({
    firebaseAuthUsers: [{
      uid: 'firebase-user-1',
      email: 'teacher@example.test',
      emailVerified: false,
    }],
  });
  input.profiles[0].legacy_uid = 'firebase-user-1';
  const report = reconcileProfiles(input);

  assert.equal(report.proposals.length, 0);
  assert.equal(report.quarantined[0].reason, 'firebase_email_not_verified');
});

test('quarantines role, tenant, active-state, and existing UID conflicts', () => {
  const scenarios = [
    [{ role: 'admin_sekolah' }, 'role_conflict'],
    [{ tenant_id: 'different-school' }, 'tenant_requires_verified_crosswalk'],
    [{ active: false }, 'active_state_conflict'],
    [{ legacy_uid: 'another-firebase-user' }, 'legacy_uid_conflict'],
  ];

  for (const [profileChanges, reason] of scenarios) {
    const legacyUid = profileChanges.legacy_uid ?? 'firebase-user-1';
    const input = makeInput({
      profiles: [{
        ...makeInput().profiles[0],
        legacy_uid: legacyUid,
        ...profileChanges,
      }],
    });
    const report = reconcileProfiles(input);
    assert.equal(report.proposals.length, 0, reason);
    assert.equal(report.quarantined[0].reason, reason);
  }
});

test('accepts tenant identifiers only when a supplied crosswalk maps them to the target', () => {
  const input = makeInput({
    firebaseAuthUsers: [{
      ...makeInput().firebaseAuthUsers[0],
      customClaims: { role: 'guru', tenantId: 'school-1' },
    }],
    profiles: [{
      ...makeInput().profiles[0],
      tenant_id: 'sman-1-tanjung-bunga',
      legacy_uid: 'firebase-user-1',
    }],
    tenantCrosswalk: {
      'school-1': 'sman-1-tanjung-bunga',
    },
  });

  assert.equal(reconcileProfiles(input).proposals.length, 0);
  assert.equal(reconcileProfiles(input).quarantined.length, 0);
});

test('uses verified sekolahId crosswalk only when the tenant claim is absent', () => {
  const input = makeInput({
    firebaseAuthUsers: [{
      ...makeInput().firebaseAuthUsers[0],
      customClaims: { role: 'guru', sekolahId: 'legacy-school' },
    }],
    firestoreUsers: [{
      ...makeInput().firestoreUsers[0],
      data: { ...makeInput().firestoreUsers[0].data, tenantId: undefined },
    }],
    profiles: [{
      ...makeInput().profiles[0],
      tenant_id: 'sman-1-tanjung-bunga',
      legacy_uid: 'firebase-user-1',
    }],
    tenantCrosswalk: { 'legacy-school': 'sman-1-tanjung-bunga' },
  });

  assert.equal(reconcileProfiles(input).proposals.length, 0);
  assert.equal(reconcileProfiles(input).quarantined.length, 0);
});

test('quarantines missing or contradictory tenant claims', () => {
  const missingClaim = makeInput({
    firebaseAuthUsers: [{
      ...makeInput().firebaseAuthUsers[0],
      customClaims: { role: 'guru' },
    }],
  });
  missingClaim.profiles[0].legacy_uid = 'firebase-user-1';
  assert.equal(reconcileProfiles(missingClaim).quarantined[0].reason, 'tenant_claim_missing');

  const conflictingClaim = makeInput({
    firebaseAuthUsers: [{
      ...makeInput().firebaseAuthUsers[0],
      customClaims: { role: 'guru', tenantId: 'another-school' },
    }],
  });
  conflictingClaim.profiles[0].legacy_uid = 'firebase-user-1';
  assert.equal(
    reconcileProfiles(conflictingClaim).quarantined[0].reason,
    'firebase_tenant_claim_firestore_conflict',
  );
});

test('does not propose ambiguous Firebase or Supabase email matches', () => {
  const duplicateFirebase = makeInput({
    firebaseAuthUsers: [
      ...makeInput().firebaseAuthUsers,
      { uid: 'firebase-user-2', email: 'teacher@example.test', emailVerified: true },
    ],
  });
  duplicateFirebase.profiles[0].legacy_uid = 'firebase-user-1';
  assert.equal(
    reconcileProfiles(duplicateFirebase).quarantined[0].reason,
    'firebase_auth_email_not_unique',
  );

  const duplicateSupabase = makeInput({
    supabaseUsers: [
      ...makeInput().supabaseUsers,
      {
        id: '00000000-0000-4000-8000-000000000002',
        email: 'teacher@example.test',
        emailConfirmedAt: '2026-01-01T00:00:00Z',
      },
    ],
  });
  duplicateSupabase.profiles[0].legacy_uid = 'firebase-user-1';
  assert.equal(
    reconcileProfiles(duplicateSupabase).quarantined[0].reason,
    'supabase_auth_email_not_unique',
  );
});

test('requires every input collection and keeps source emails out of the report', () => {
  assert.throws(() => reconcileProfiles({}), /must be an array/);
  const report = reconcileProfiles(makeInput({
    firebaseAuthUsers: [{
      uid: 'firebase-user-1',
      email: 'teacher@example.test',
      emailVerified: false,
    }],
  }));
  assert.equal(JSON.stringify(report.quarantined).includes('teacher@example.test'), false);
});
