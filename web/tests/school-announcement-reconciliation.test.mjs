import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileSchoolAnnouncements } from '../../scripts/reconcileSchoolAnnouncements.mjs';

const adminId = '11111111-1111-4111-8111-111111111111';

const makeInput = overrides => ({
  announcements: [{
    tenantId: 'legacy-school',
    announcementId: 'notice-1',
    data: {
      judul: '  Informasi   Sekolah ',
      isi: ' Jadwal kegiatan sekolah. ',
      penulisUid: 'legacy-admin',
      dibuat: '2026-01-03T00:00:00Z',
    },
  }],
  tenantCrosswalk: { 'legacy-school': 'school-target' },
  targetTenants: [{ id: 'school-target', active: true }],
  profiles: [{
    id: adminId,
    legacy_uid: 'legacy-admin',
    role: 'admin_sekolah',
    tenant_id: 'school-target',
    active: true,
  }],
  targetEntitlements: [{
    tenant_id: 'school-target',
    status: 'active',
    valid_until: null,
  }],
  targetAnnouncements: [],
  reconciledAt: '2026-02-01T00:00:00Z',
  ...overrides,
});

test('maps tenant announcement with deterministic source identity and clean text', () => {
  const report = reconcileSchoolAnnouncements(makeInput());
  assert.equal(report.mode, 'report-only');
  assert.equal(report.summary.proposals, 1);
  assert.equal(report.proposals[0].tenant_id, 'school-target');
  assert.equal(report.proposals[0].author_id, adminId);
  assert.equal(report.proposals[0].title, 'Informasi   Sekolah');
  assert.equal(report.proposals[0].body, 'Jadwal kegiatan sekolah.');
  assert.equal(report.proposals[0].created_at, '2026-01-03T00:00:00.000Z');
  assert.match(report.proposals[0].id, /^[0-9a-f-]{36}$/i);
  assert.equal(JSON.stringify(report).includes('legacy-admin'), false);
  assert.equal(JSON.stringify(report).includes('notice-1'), false);
});

test('requires exact source fields and valid title, body and creation timestamp', () => {
  const extra = makeInput();
  extra.announcements[0].data.unexpected = true;
  assert.equal(
    reconcileSchoolAnnouncements(extra).quarantined[0].reason,
    'source_announcement_fields_invalid',
  );

  const longTitle = makeInput();
  longTitle.announcements[0].data.judul = 'x'.repeat(201);
  assert.equal(
    reconcileSchoolAnnouncements(longTitle).quarantined[0].reason,
    'source_announcement_content_invalid',
  );

  const badTimestamp = makeInput();
  badTimestamp.announcements[0].data.dibuat = 'invalid';
  assert.equal(
    reconcileSchoolAnnouncements(badTimestamp).quarantined[0].reason,
    'source_announcement_fields_invalid',
  );
});

test('requires unique verified tenant crosswalk, active tenant and author staff profile', () => {
  const noCrosswalk = reconcileSchoolAnnouncements(makeInput({ tenantCrosswalk: {} }));
  assert.equal(noCrosswalk.quarantined[0].reason, 'verified_tenant_crosswalk_missing');

  const inactiveTenant = makeInput();
  inactiveTenant.targetTenants[0].active = false;
  assert.equal(
    reconcileSchoolAnnouncements(inactiveTenant).quarantined[0].reason,
    'active_target_tenant_not_verified',
  );

  const wrongAuthor = makeInput();
  wrongAuthor.profiles[0].role = 'guru';
  assert.equal(
    reconcileSchoolAnnouncements(wrongAuthor).quarantined[0].reason,
    'announcement_author_profile_mismatch',
  );
});

test('quarantines missing or ambiguous author profile and requires a valid target entitlement', () => {
  const missingAuthor = reconcileSchoolAnnouncements(makeInput({ profiles: [] }));
  assert.equal(
    missingAuthor.quarantined[0].reason,
    'announcement_author_legacy_uid_not_unique',
  );

  const missingEntitlement = reconcileSchoolAnnouncements(makeInput({ targetEntitlements: [] }));
  assert.equal(
    missingEntitlement.quarantined[0].reason,
    'target_tenant_entitlement_not_verified_for_writes',
  );

  const expired = makeInput();
  expired.targetEntitlements[0].valid_until = '2026-01-31T00:00:00Z';
  assert.equal(
    reconcileSchoolAnnouncements(expired).quarantined[0].reason,
    'target_tenant_entitlement_not_verified_for_writes',
  );
});

test('is idempotent and quarantines deterministic ID conflicts', () => {
  const proposal = reconcileSchoolAnnouncements(makeInput()).proposals[0];
  const same = reconcileSchoolAnnouncements(makeInput({
    targetAnnouncements: [{ ...proposal }],
  }));
  assert.equal(same.summary.alreadyPresent, 1);

  const idConflict = reconcileSchoolAnnouncements(makeInput({
    targetAnnouncements: [{ ...proposal, body: 'Different body' }],
  }));
  assert.equal(idConflict.quarantined[0].reason, 'target_announcement_metadata_conflict');

});

test('requires collections, crosswalk and reconciliation timestamp', () => {
  assert.throws(() => reconcileSchoolAnnouncements({}), /must be an array/);
  assert.throws(() => reconcileSchoolAnnouncements(makeInput({ reconciledAt: 'bad' })), /reconciledAt/);
});
