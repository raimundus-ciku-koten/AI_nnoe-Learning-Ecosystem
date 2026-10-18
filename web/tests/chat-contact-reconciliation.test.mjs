import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileChatContacts } from '../../scripts/reconcileChatContacts.mjs';

const senderId = '11111111-1111-4111-8111-111111111111';
const recipientId = '22222222-2222-4222-8222-222222222222';
const groupId = '33333333-3333-4333-8333-333333333333';

const profile = (id, legacyUid, overrides = {}) => ({
  id,
  legacy_uid: legacyUid,
  nama: `Profil ${legacyUid}`,
  role: 'guru',
  tenant_id: 'school-a',
  active: true,
  ...overrides,
});

const directory = (legacyUid, overrides = {}) => ({
  legacyUid,
  data: {
    role: 'guru',
    tenantId: 'school-a',
    updatedAt: 1760000000000,
    ...overrides,
  },
});

const sourceContact = () => ({
  pairId: 'd_legacy-recipient_legacy-sender',
  data: {
    from: 'legacy-sender',
    to: 'legacy-recipient',
    status: 'pending',
    names: { 'legacy-sender': '  Guru   Raimundus ' },
    createdAt: 1759900000000,
  },
});

const makeInput = overrides => ({
  contacts: [sourceContact()],
  chatDirectory: [
    directory('legacy-sender'),
    directory('legacy-recipient'),
  ],
  profiles: [
    profile(senderId, 'legacy-sender', { nama: 'Raimundus Ciku Koten' }),
    profile(recipientId, 'legacy-recipient', { nama: 'Pengguna Sekolah' }),
  ],
  targetTenants: [{ id: 'school-a', active: true }],
  targetContacts: [],
  reconciledAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

test('maps canonical contact relation with deterministic identity and profile fallback', () => {
  const report = reconcileChatContacts(makeInput());
  assert.equal(report.mode, 'report-only');
  assert.equal(report.summary.proposals, 1);
  const proposal = report.proposals[0];
  assert.match(proposal.id, /^[0-9a-f-]{36}$/i);
  assert.equal(proposal.from_user_id, senderId);
  assert.equal(proposal.to_user_id, recipientId);
  assert.equal(proposal.status, 'pending');
  assert.deepEqual(proposal.participant_names, {
    [senderId]: 'Guru Raimundus',
    [recipientId]: 'Pengguna Sekolah',
  });
  assert.equal(proposal.created_at, '2025-10-08T05:06:40.000Z');
  assert.equal(proposal.updated_at, null);
  assert.equal(JSON.stringify(report).includes('legacy-sender'), false);
  assert.equal(JSON.stringify(report).includes(sourceContact().pairId), false);
});

test('allows cross-tenant contacts only for a superadmin sender', () => {
  const input = makeInput({
    contacts: [{
      pairId: 'd_legacy-recipient_legacy-sender',
      data: {
        from: 'legacy-sender',
        to: 'legacy-recipient',
        status: 'accepted',
        names: {
          'legacy-sender': 'CEO',
          'legacy-recipient': 'Operator',
        },
        createdAt: 1759900000000,
        updatedAt: 1760000000000,
      },
    }],
    chatDirectory: [
      directory('legacy-sender', { role: 'superadmin', tenantId: '' }),
      directory('legacy-recipient', { role: 'admin_sekolah', tenantId: 'school-b' }),
    ],
    profiles: [
      profile(senderId, 'legacy-sender', {
        role: 'superadmin',
        tenant_id: null,
        nama: 'CEO AI_nnoe Corp.',
      }),
      profile(recipientId, 'legacy-recipient', {
        role: 'admin_sekolah',
        tenant_id: 'school-b',
        nama: 'Operator Sekolah',
      }),
    ],
    targetTenants: [
      { id: 'school-a', active: true },
      { id: 'school-b', active: true },
    ],
  });
  const report = reconcileChatContacts(input);
  assert.equal(report.summary.proposals, 1);
  assert.equal(report.proposals[0].status, 'accepted');
  assert.equal(report.proposals[0].updated_at, '2025-10-09T08:53:20.000Z');
});

test('quarantines invalid source shape, noncanonical pair IDs and invalid timestamps', () => {
  const noncanonical = makeInput();
  noncanonical.contacts[0].pairId = 'd_wrong_pair';
  assert.equal(
    reconcileChatContacts(noncanonical).quarantined[0].reason,
    'source_chat_contact_fields_invalid',
  );

  const invalidStatus = makeInput();
  invalidStatus.contacts[0].data.status = 'blocked';
  assert.equal(
    reconcileChatContacts(invalidStatus).quarantined[0].reason,
    'source_chat_contact_fields_invalid',
  );

  const invalidNames = makeInput();
  invalidNames.contacts[0].data.names['legacy-outsider'] = 'Private name';
  assert.equal(
    reconcileChatContacts(invalidNames).quarantined[0].reason,
    'source_chat_contact_names_invalid',
  );

  const invalidUpdate = makeInput();
  invalidUpdate.contacts[0].data.updatedAt = 1759800000000;
  assert.equal(
    reconcileChatContacts(invalidUpdate).quarantined[0].reason,
    'source_chat_contact_fields_invalid',
  );
});

test('requires unique active profiles, directory crosswalks and active tenants', () => {
  const missingProfile = reconcileChatContacts(makeInput({ profiles: [] }));
  assert.equal(
    missingProfile.quarantined[0].reason,
    'chat_contact_profile_legacy_uid_not_unique',
  );

  const inactiveProfile = makeInput();
  inactiveProfile.profiles[1].active = false;
  assert.equal(
    reconcileChatContacts(inactiveProfile).quarantined[0].reason,
    'chat_contact_profile_invalid',
  );

  const mismatchedDirectory = makeInput();
  mismatchedDirectory.chatDirectory[1].data.tenantId = 'school-b';
  assert.equal(
    reconcileChatContacts(mismatchedDirectory).quarantined[0].reason,
    'chat_contact_directory_profile_mismatch',
  );

  const inactiveTenant = makeInput();
  inactiveTenant.targetTenants[0].active = false;
  assert.equal(
    reconcileChatContacts(inactiveTenant).quarantined[0].reason,
    'chat_contact_active_tenant_not_verified',
  );
});

test('quarantines cross-tenant ordinary requests and future source timestamps', () => {
  const crossTenant = makeInput({
    chatDirectory: [
      directory('legacy-sender'),
      directory('legacy-recipient', { role: 'admin_sekolah', tenantId: 'school-b' }),
    ],
    profiles: [
      profile(senderId, 'legacy-sender'),
      profile(recipientId, 'legacy-recipient', {
        role: 'admin_sekolah',
        tenant_id: 'school-b',
      }),
    ],
    targetTenants: [
      { id: 'school-a', active: true },
      { id: 'school-b', active: true },
    ],
  });
  assert.equal(
    reconcileChatContacts(crossTenant).quarantined[0].reason,
    'cross_tenant_contact_request_not_from_superadmin',
  );

  const future = makeInput({ reconciledAt: '2025-10-01T00:00:00Z' });
  assert.equal(
    reconcileChatContacts(future).quarantined[0].reason,
    'source_chat_contact_timestamp_in_future',
  );
});

test('is idempotent and detects target ID or unordered-pair conflicts', () => {
  const proposal = reconcileChatContacts(makeInput()).proposals[0];
  const same = reconcileChatContacts(makeInput({ targetContacts: [{ ...proposal }] }));
  assert.equal(same.summary.alreadyPresent, 1);

  const conflict = reconcileChatContacts(makeInput({
    targetContacts: [{ ...proposal, status: 'accepted' }],
  }));
  assert.equal(
    conflict.quarantined[0].reason,
    'target_chat_contact_metadata_conflict',
  );

  const pairConflict = makeInput({
    targetContacts: [{
      ...proposal,
      id: groupId,
      from_user_id: recipientId,
      to_user_id: senderId,
    }],
  });
  assert.equal(
    reconcileChatContacts(pairConflict).quarantined[0].reason,
    'target_chat_contact_metadata_conflict',
  );
});

test('requires schema arrays and a valid reconciliation timestamp', () => {
  assert.throws(() => reconcileChatContacts({}), /must be an array/);
  assert.throws(() => reconcileChatContacts(makeInput({ reconciledAt: 'bad' })), /reconciledAt/);
});
