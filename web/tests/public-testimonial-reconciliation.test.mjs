import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcilePublicTestimonials } from '../../scripts/reconcilePublicTestimonials.mjs';

const makeInput = overrides => ({
  firestorePublicTestimonials: [{
    documentId: 'legacy-user-1',
    data: {
      tenantId: 'legacy-school',
      sourceId: 'legacy-user-1',
      status: 'published',
      consent: true,
      displayName: 'Pengguna AI_nnoe',
      role: 'guru',
      quote: 'Aplikasi ini membantu pekerjaan saya.',
    },
  }],
  firestoreModerationTestimonials: [{
    tenantId: 'legacy-school',
    documentId: 'legacy-user-1',
    data: {
      ownerUid: 'legacy-user-1',
      tenantId: 'legacy-school',
      displayName: 'Pengguna AI_nnoe',
      role: 'guru',
      quote: 'Pengalaman awal.',
      rating: 5,
      consent: true,
      status: 'published',
      submittedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      quoteFinal: 'Aplikasi ini membantu pekerjaan saya.',
      reviewedAt: '2026-01-02T00:00:00Z',
    },
  }],
  tenantCrosswalk: { 'legacy-school': 'school-target' },
  targetTenants: [{ id: 'school-target', active: true }],
  targetTestimonials: [],
  ...overrides,
});

test('proposes only a published, consented testimonial with exact moderation match', () => {
  const report = reconcilePublicTestimonials(makeInput());
  assert.equal(report.mode, 'report-only');
  assert.equal(report.summary.proposals, 1);
  assert.deepEqual(report.proposals[0], {
    id: 'c6adb6fe-7372-5b78-a181-ea4c996aa5d1',
    tenant_id: 'school-target',
    display_name: 'Pengguna AI_nnoe',
    role: 'guru',
    quote: 'Aplikasi ini membantu pekerjaan saya.',
    consent: true,
    status: 'published',
    published_at: '2026-01-02T00:00:00.000Z',
  });
});

test('quarantines missing consent, private status, and mismatched moderation content', () => {
  const noConsent = makeInput();
  noConsent.firestorePublicTestimonials[0].data.consent = false;
  assert.equal(
    reconcilePublicTestimonials(noConsent).quarantined[0].reason,
    'public_source_fields_invalid',
  );

  const pending = makeInput();
  pending.firestorePublicTestimonials[0].data.status = 'pending';
  assert.equal(
    reconcilePublicTestimonials(pending).quarantined[0].reason,
    'public_source_fields_invalid',
  );

  const contentMismatch = makeInput();
  contentMismatch.firestoreModerationTestimonials[0].data.quoteFinal = 'Naskah lain.';
  assert.equal(
    reconcilePublicTestimonials(contentMismatch).quarantined[0].reason,
    'public_source_does_not_match_moderation',
  );
});

test('requires tenant crosswalk and exactly one active target tenant', () => {
  const noCrosswalk = reconcilePublicTestimonials(makeInput({ tenantCrosswalk: {} }));
  assert.equal(noCrosswalk.quarantined[0].reason, 'verified_tenant_crosswalk_missing');

  const inactive = makeInput();
  inactive.targetTenants[0].active = false;
  assert.equal(
    reconcilePublicTestimonials(inactive).quarantined[0].reason,
    'active_target_tenant_not_verified',
  );
});

test('requires a unique matching moderation source and valid review timestamp', () => {
  const missing = reconcilePublicTestimonials(makeInput({ firestoreModerationTestimonials: [] }));
  assert.equal(
    missing.quarantined[0].reason,
    'moderation_source_missing_or_ambiguous',
  );

  const invalidTime = makeInput();
  invalidTime.firestoreModerationTestimonials[0].data.reviewedAt = 'invalid';
  assert.equal(
    reconcilePublicTestimonials(invalidTime).quarantined[0].reason,
    'moderation_source_not_approved',
  );
});

test('is idempotent for exact target rows and quarantines deterministic ID collisions', () => {
  const proposal = reconcilePublicTestimonials(makeInput()).proposals[0];
  const present = reconcilePublicTestimonials(makeInput({
    targetTestimonials: [{ ...proposal }],
  }));
  assert.equal(present.summary.alreadyPresent, 1);
  assert.equal(present.summary.proposals, 0);

  const conflict = reconcilePublicTestimonials(makeInput({
    targetTestimonials: [{ ...proposal, quote: 'Different quote' }],
  }));
  assert.equal(conflict.quarantined[0].reason, 'target_testimonial_metadata_conflict');
});

test('requires all schema arrays and a verified tenant crosswalk', () => {
  assert.throws(() => reconcilePublicTestimonials({}), /must be an array/);
  assert.throws(() => reconcilePublicTestimonials({
    firestorePublicTestimonials: [],
    firestoreModerationTestimonials: [],
    targetTenants: [],
    targetTestimonials: [],
    tenantCrosswalk: [],
  }), /verified mapping object/);
});
