import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileChatConversations } from '../../scripts/reconcileChatConversations.mjs';

const creatorId = '11111111-1111-4111-8111-111111111111';
const peerId = '22222222-2222-4222-8222-222222222222';
const groupId = '33333333-3333-4333-8333-333333333333';

const profile = (id, legacyUid, overrides = {}) => ({
  id,
  legacy_uid: legacyUid,
  nama: `Nama ${legacyUid}`,
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

const directChat = () => ({
  chatId: 'd_legacy-creator_legacy-peer',
  meta: {
    type: 'direct',
    members: { 'legacy-creator': true, 'legacy-peer': true },
    names: { 'legacy-creator': '  Raimundus   Koten ' },
    createdBy: 'legacy-creator',
    createdAt: 1760000000000,
  },
});

const makeInput = overrides => ({
  chats: [directChat()],
  chatDirectory: [
    directory('legacy-creator'),
    directory('legacy-peer'),
  ],
  profiles: [
    profile(creatorId, 'legacy-creator', { nama: 'Raimundus Ciku Koten' }),
    profile(peerId, 'legacy-peer', { nama: 'Pengguna Sekolah' }),
  ],
  targetTenants: [{ id: 'school-a', active: true }],
  targetConversations: [],
  reconciledAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

test('maps direct-chat metadata with deterministic identity and profile-name fallback', () => {
  const report = reconcileChatConversations(makeInput());
  assert.equal(report.mode, 'report-only');
  assert.equal(report.summary.proposals, 1);
  const proposal = report.proposals[0];
  assert.match(proposal.id, /^[0-9a-f-]{36}$/i);
  assert.equal(proposal.type, 'direct');
  assert.equal(proposal.title, null);
  assert.deepEqual(proposal.participant_ids, [creatorId, peerId]);
  assert.deepEqual(proposal.participant_names, {
    [creatorId]: 'Raimundus Koten',
    [peerId]: 'Pengguna Sekolah',
  });
  assert.equal(proposal.created_by, creatorId);
  assert.equal(proposal.created_at, '2025-10-09T08:53:20.000Z');
  assert.equal(Object.hasOwn(proposal, 'tenant_id'), false);
  assert.equal(JSON.stringify(report).includes('legacy-creator'), false);
  assert.equal(JSON.stringify(report).includes('d_legacy-creator'), false);
});

test('maps superadmin-created cross-tenant groups without assigning one tenant', () => {
  const input = makeInput({
    chats: [{
      chatId: 'group_chat_01',
      meta: {
        type: 'group',
        name: '  Tim   Matematika ',
        members: {
          'legacy-creator': true,
          'legacy-peer': true,
          'legacy-group': true,
        },
        names: { 'legacy-creator': 'CEO' },
        createdBy: 'legacy-creator',
        createdAt: 1760000000000,
      },
    }],
    chatDirectory: [
      directory('legacy-creator', { role: 'superadmin', tenantId: '' }),
      directory('legacy-peer'),
      directory('legacy-group', { role: 'admin_sekolah', tenantId: 'school-b' }),
    ],
    profiles: [
      profile(creatorId, 'legacy-creator', {
        role: 'superadmin',
        tenant_id: null,
        nama: 'CEO AI_nnoe Corp.',
      }),
      profile(peerId, 'legacy-peer'),
      profile(groupId, 'legacy-group', {
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
  const report = reconcileChatConversations(input);
  assert.equal(report.summary.proposals, 1);
  assert.equal(report.proposals[0].type, 'group');
  assert.equal(report.proposals[0].title, 'Tim Matematika');
  assert.equal(report.proposals[0].participant_names[groupId], 'Operator Sekolah');
});

test('rejects non-superadmin cross-tenant groups and noncanonical direct IDs', () => {
  const crossTenant = makeInput({
    chats: [{
      chatId: 'group_chat_01',
      meta: {
        type: 'group',
        members: {
          'legacy-creator': true,
          'legacy-peer': true,
          'legacy-group': true,
        },
        createdBy: 'legacy-creator',
        createdAt: 1760000000000,
      },
    }],
    chatDirectory: [
      directory('legacy-creator'),
      directory('legacy-peer'),
      directory('legacy-group', { role: 'admin_sekolah', tenantId: 'school-b' }),
    ],
    profiles: [
      profile(creatorId, 'legacy-creator'),
      profile(peerId, 'legacy-peer'),
      profile(groupId, 'legacy-group', {
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
    reconcileChatConversations(crossTenant).quarantined[0].reason,
    'cross_tenant_chat_creator_not_superadmin',
  );

  const wrongDirectId = makeInput();
  wrongDirectId.chats[0].chatId = 'd_wrong_id';
  assert.equal(
    reconcileChatConversations(wrongDirectId).quarantined[0].reason,
    'source_direct_chat_id_mismatch',
  );
});

test('quarantines malformed membership, names, metadata and timestamps', () => {
  const tooMany = makeInput();
  tooMany.chats[0].meta.members = Object.fromEntries(
    Array.from({ length: 51 }, (_, index) => [`uid-${index}`, true]),
  );
  tooMany.chats[0].meta.createdBy = 'uid-0';
  assert.equal(
    reconcileChatConversations(tooMany).quarantined[0].reason,
    'source_chat_members_invalid',
  );

  const nonmemberName = makeInput();
  nonmemberName.chats[0].meta.names['not-a-member'] = 'Nope';
  assert.equal(
    reconcileChatConversations(nonmemberName).quarantined[0].reason,
    'source_chat_names_invalid',
  );

  const badTimestamp = makeInput();
  badTimestamp.chats[0].meta.createdAt = Number.NaN;
  assert.equal(
    reconcileChatConversations(badTimestamp).quarantined[0].reason,
    'source_chat_meta_invalid',
  );

  const extraField = makeInput();
  extraField.chats[0].meta.unknown = true;
  assert.equal(
    reconcileChatConversations(extraField).quarantined[0].reason,
    'source_chat_path_or_meta_fields_invalid',
  );
});

test('requires a unique active participant profile, directory and tenant crosswalk', () => {
  const missingProfile = reconcileChatConversations(makeInput({ profiles: [] }));
  assert.equal(
    missingProfile.quarantined[0].reason,
    'chat_participant_legacy_uid_not_unique',
  );

  const duplicateProfile = makeInput();
  duplicateProfile.profiles.push(profile(
    '44444444-4444-4444-8444-444444444444',
    'legacy-peer',
  ));
  assert.equal(
    reconcileChatConversations(duplicateProfile).quarantined[0].reason,
    'chat_participant_legacy_uid_not_unique',
  );

  const inactiveProfile = makeInput();
  inactiveProfile.profiles[1].active = false;
  assert.equal(
    reconcileChatConversations(inactiveProfile).quarantined[0].reason,
    'chat_participant_profile_invalid',
  );

  const badDirectory = makeInput();
  badDirectory.chatDirectory[1].data.tenantId = 'school-b';
  assert.equal(
    reconcileChatConversations(badDirectory).quarantined[0].reason,
    'chat_directory_profile_mismatch',
  );

  const inactiveTenant = makeInput();
  inactiveTenant.targetTenants[0].active = false;
  assert.equal(
    reconcileChatConversations(inactiveTenant).quarantined[0].reason,
    'chat_participant_active_tenant_not_verified',
  );
});

test('is idempotent, detects target conflicts and quarantines duplicate source paths', () => {
  const proposal = reconcileChatConversations(makeInput()).proposals[0];
  const alreadyPresent = reconcileChatConversations(makeInput({
    targetConversations: [{ ...proposal }],
  }));
  assert.equal(alreadyPresent.summary.alreadyPresent, 1);

  const conflict = reconcileChatConversations(makeInput({
    targetConversations: [{ ...proposal, title: 'Different title' }],
  }));
  assert.equal(
    conflict.quarantined[0].reason,
    'target_chat_conversation_metadata_conflict',
  );

  const duplicateSource = makeInput();
  duplicateSource.chats.push(directChat());
  assert.equal(
    reconcileChatConversations(duplicateSource).quarantined[0].reason,
    'source_chat_id_not_unique',
  );
});

test('requires all report inputs and a valid reconciliation timestamp', () => {
  assert.throws(() => reconcileChatConversations({}), /must be an array/);
  assert.throws(() => reconcileChatConversations(makeInput({ reconciledAt: 'invalid' })), /reconciledAt/);
});
