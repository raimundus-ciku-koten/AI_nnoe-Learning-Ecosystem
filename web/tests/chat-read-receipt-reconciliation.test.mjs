import test from 'node:test';
import assert from 'node:assert/strict';
import { chatConversationId } from '../../scripts/reconcileChatConversations.mjs';
import { reconcileChatReadReceipts } from '../../scripts/reconcileChatReadReceipts.mjs';

const chatId = 'd_legacy-creator_legacy-peer';
const userId = '11111111-1111-4111-8111-111111111111';
const peerId = '22222222-2222-4222-8222-222222222222';

const makeInput = overrides => ({
  receipts: [{ chatId, legacyUid: 'legacy-creator', value: 1760000000000 }],
  profiles: [{
    id: userId,
    legacy_uid: 'legacy-creator',
    role: 'guru',
    tenant_id: 'school-a',
    active: true,
  }],
  targetConversations: [{
    id: chatConversationId(chatId),
    type: 'direct',
    participant_ids: [userId, peerId],
  }],
  targetReceipts: [],
  reconciledAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

test('maps a read cursor to the deterministic conversation and verified user profile', () => {
  const report = reconcileChatReadReceipts(makeInput());
  assert.equal(report.mode, 'report-only');
  assert.equal(report.summary.proposals, 1);
  assert.deepEqual(report.proposals[0], {
    conversation_id: chatConversationId(chatId),
    user_id: userId,
    last_read_at: '2025-10-09T08:53:20.000Z',
  });
  assert.equal(JSON.stringify(report).includes('legacy-creator'), false);
  assert.equal(JSON.stringify(report).includes(chatId), false);
});

test('quarantines invalid and future timestamps or unresolved paths', () => {
  const badTimestamp = makeInput();
  badTimestamp.receipts[0].value = '1760000000000';
  assert.equal(
    reconcileChatReadReceipts(badTimestamp).quarantined[0].reason,
    'source_chat_read_receipt_timestamp_invalid',
  );

  const futureTimestamp = makeInput({
    reconciledAt: '2025-10-01T00:00:00Z',
  });
  assert.equal(
    reconcileChatReadReceipts(futureTimestamp).quarantined[0].reason,
    'source_chat_read_receipt_timestamp_in_future',
  );

  const noConversation = reconcileChatReadReceipts(makeInput({ targetConversations: [] }));
  assert.equal(
    noConversation.quarantined[0].reason,
    'target_chat_read_receipt_conversation_not_unique',
  );
});

test('requires an active profile that belongs to the parent conversation', () => {
  const inactive = makeInput();
  inactive.profiles[0].active = false;
  assert.equal(
    reconcileChatReadReceipts(inactive).quarantined[0].reason,
    'chat_read_receipt_user_not_active_conversation_participant',
  );

  const notMember = makeInput();
  notMember.targetConversations[0].participant_ids = [peerId, '33333333-3333-4333-8333-333333333333'];
  assert.equal(
    reconcileChatReadReceipts(notMember).quarantined[0].reason,
    'chat_read_receipt_user_not_active_conversation_participant',
  );

  const ambiguousProfile = makeInput();
  ambiguousProfile.profiles.push({ ...ambiguousProfile.profiles[0] });
  assert.equal(
    reconcileChatReadReceipts(ambiguousProfile).quarantined[0].reason,
    'chat_read_receipt_user_legacy_uid_not_unique',
  );
});

test('is idempotent and quarantines conflicting or duplicate receipts', () => {
  const proposal = reconcileChatReadReceipts(makeInput()).proposals[0];
  const same = reconcileChatReadReceipts(makeInput({ targetReceipts: [{ ...proposal }] }));
  assert.equal(same.summary.alreadyPresent, 1);

  const conflict = reconcileChatReadReceipts(makeInput({
    targetReceipts: [{ ...proposal, last_read_at: '2025-10-08T08:53:20.000Z' }],
  }));
  assert.equal(
    conflict.quarantined[0].reason,
    'target_chat_read_receipt_metadata_conflict',
  );

  const duplicateSource = makeInput();
  duplicateSource.receipts.push({ ...duplicateSource.receipts[0] });
  assert.equal(
    reconcileChatReadReceipts(duplicateSource).quarantined[0].reason,
    'source_chat_read_receipt_path_not_unique',
  );
});

test('requires all source/target arrays and a valid reconciliation timestamp', () => {
  assert.throws(() => reconcileChatReadReceipts({}), /must be an array/);
  assert.throws(() => reconcileChatReadReceipts(makeInput({ reconciledAt: 'invalid' })), /reconciledAt/);
});
