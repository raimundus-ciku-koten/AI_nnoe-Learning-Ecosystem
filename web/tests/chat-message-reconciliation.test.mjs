import test from 'node:test';
import assert from 'node:assert/strict';
import { chatConversationId } from '../../scripts/reconcileChatConversations.mjs';
import { reconcileChatMessages } from '../../scripts/reconcileChatMessages.mjs';

const chatId = 'd_legacy-creator_legacy-peer';
const creatorId = '11111111-1111-4111-8111-111111111111';
const peerId = '22222222-2222-4222-8222-222222222222';
const driveIndexId = '33333333-3333-4333-8333-333333333333';
const messageSourcePath = `chat/legacy-creator/${chatId}/attachment-1`;
const fingerprint = 'a'.repeat(64);
const wrappedKey = 'b'.repeat(512);

const baseInput = overrides => ({
  messages: [{
    chatId,
    messageId: 'message-1',
    data: {
      senderId: 'legacy-creator',
      type: 'text',
      text: '  Halo, semua.  ',
      ts: 1760000000000,
    },
  }],
  profiles: [
    {
      id: creatorId,
      legacy_uid: 'legacy-creator',
      role: 'guru',
      tenant_id: 'school-a',
      active: true,
    },
    {
      id: peerId,
      legacy_uid: 'legacy-peer',
      role: 'guru',
      tenant_id: 'school-a',
      active: true,
    },
  ],
  targetConversations: [{
    id: chatConversationId(chatId),
    type: 'direct',
    participant_ids: [creatorId, peerId],
  }],
  attachmentCrosswalk: {},
  targetDriveFiles: [],
  targetDriveAccess: [],
  targetDriveKeyEnvelopes: [],
  targetEncryptionKeys: [],
  targetTenants: [{ id: 'school-a', active: true }],
  targetMessages: [],
  reconciledAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

const attachmentOverrides = () => ({
  messages: [{
    chatId,
    messageId: 'message-attachment',
    data: {
      senderId: 'legacy-creator',
      type: 'file',
      filePath: messageSourcePath,
      fileName: '  Modul Matematika.pdf ',
      fileSize: 2048,
      ts: 1760000000000,
    },
  }],
  attachmentCrosswalk: { [messageSourcePath]: driveIndexId },
  targetDriveFiles: [{
    id: driveIndexId,
    owner_id: creatorId,
    tenant_id: 'school-a',
    drive_file_id: 'private-drive-file-id',
    category: 'communication',
    ciphertext_sha256: 'c'.repeat(64),
    ciphertext_size_bytes: 3072,
    encryption_version: 1,
    revoked_at: null,
  }],
  targetDriveAccess: [{
    file_id: driveIndexId,
    grantee_id: peerId,
    access_level: 'read',
    revoked_at: null,
  }],
  targetDriveKeyEnvelopes: [
    {
      file_id: driveIndexId,
      recipient_id: creatorId,
      wrapped_data_key: wrappedKey,
      recipient_key_fingerprint: fingerprint,
      key_version: 1,
      revoked_at: null,
    },
    {
      file_id: driveIndexId,
      recipient_id: peerId,
      wrapped_data_key: wrappedKey,
      recipient_key_fingerprint: fingerprint,
      key_version: 1,
      revoked_at: null,
    },
  ],
  targetEncryptionKeys: [
    { user_id: creatorId, fingerprint, key_version: 1 },
    { user_id: peerId, fingerprint, key_version: 1 },
  ],
});

test('maps text message to its deterministic conversation and sender without source IDs', () => {
  const report = reconcileChatMessages(baseInput());
  assert.equal(report.mode, 'report-only');
  assert.equal(report.summary.proposals, 1);
  const proposal = report.proposals[0];
  assert.match(proposal.id, /^[0-9a-f-]{36}$/i);
  assert.equal(proposal.conversation_id, chatConversationId(chatId));
  assert.equal(proposal.sender_id, creatorId);
  assert.equal(proposal.type, 'text');
  assert.equal(proposal.body, '  Halo, semua.  ');
  assert.equal(proposal.drive_file_index_id, null);
  assert.equal(proposal.created_at, '2025-10-09T08:53:20.000Z');
  assert.equal(JSON.stringify(report).includes('legacy-creator'), false);
  assert.equal(JSON.stringify(report).includes('message-1'), false);
});

test('maps an attachment only with an active encrypted Drive index shared to all participants', () => {
  const report = reconcileChatMessages(baseInput(attachmentOverrides()));
  assert.equal(report.summary.proposals, 1);
  assert.equal(report.proposals[0].type, 'file');
  assert.equal(report.proposals[0].drive_file_index_id, driveIndexId);
  assert.equal(report.proposals[0].file_name, '  Modul Matematika.pdf ');
  assert.equal(report.proposals[0].file_size, 2048);
  assert.equal(JSON.stringify(report).includes(messageSourcePath), false);
  assert.equal(JSON.stringify(report).includes('private-drive-file-id'), false);
});

test('quarantines an attachment without a verified Drive crosswalk or active share', () => {
  const noCrosswalk = reconcileChatMessages(baseInput({
    ...attachmentOverrides(),
    attachmentCrosswalk: {},
  }));
  assert.equal(
    noCrosswalk.quarantined[0].reason,
    'verified_chat_drive_attachment_crosswalk_missing',
  );

  const noAccess = attachmentOverrides();
  noAccess.targetDriveAccess = [];
  assert.equal(
    reconcileChatMessages(baseInput(noAccess)).quarantined[0].reason,
    'target_chat_drive_access_incomplete',
  );

  const noPeerEnvelope = attachmentOverrides();
  noPeerEnvelope.targetDriveKeyEnvelopes.pop();
  assert.equal(
    reconcileChatMessages(baseInput(noPeerEnvelope)).quarantined[0].reason,
    'target_chat_drive_key_envelope_incomplete',
  );

  const revokedFile = attachmentOverrides();
  revokedFile.targetDriveFiles[0].revoked_at = '2026-01-01T00:00:00Z';
  assert.equal(
    reconcileChatMessages(baseInput(revokedFile)).quarantined[0].reason,
    'target_chat_drive_file_invalid',
  );

  const shortCiphertext = attachmentOverrides();
  shortCiphertext.targetDriveFiles[0].ciphertext_size_bytes = 1024;
  assert.equal(
    reconcileChatMessages(baseInput(shortCiphertext)).quarantined[0].reason,
    'target_chat_drive_file_invalid',
  );
});

test('requires sender to be a parent participant and source messages to match exact rules', () => {
  const outsider = baseInput();
  outsider.profiles.push({
    id: '44444444-4444-4444-8444-444444444444',
    legacy_uid: 'legacy-outsider',
    role: 'guru',
    tenant_id: 'school-a',
    active: true,
  });
  outsider.messages[0].data.senderId = 'legacy-outsider';
  assert.equal(
    reconcileChatMessages(outsider).quarantined[0].reason,
    'chat_message_sender_not_active_conversation_participant',
  );

  const extraField = baseInput();
  extraField.messages[0].data.unexpected = true;
  assert.equal(
    reconcileChatMessages(extraField).quarantined[0].reason,
    'source_chat_text_message_invalid',
  );

  const wrongPathOwner = baseInput(attachmentOverrides());
  wrongPathOwner.messages[0].data.filePath = `chat/legacy-peer/${chatId}/attachment-1`;
  assert.equal(
    reconcileChatMessages(wrongPathOwner).quarantined[0].reason,
    'source_chat_attachment_path_mismatch',
  );
});

test('is idempotent and detects target conflicts or duplicate source message paths', () => {
  const proposal = reconcileChatMessages(baseInput()).proposals[0];
  const alreadyPresent = reconcileChatMessages(baseInput({
    targetMessages: [{ ...proposal }],
  }));
  assert.equal(alreadyPresent.summary.alreadyPresent, 1);

  const conflict = reconcileChatMessages(baseInput({
    targetMessages: [{ ...proposal, body: 'Different body' }],
  }));
  assert.equal(
    conflict.quarantined[0].reason,
    'target_chat_message_metadata_conflict',
  );

  const duplicate = baseInput();
  duplicate.messages.push({ ...duplicate.messages[0] });
  assert.equal(
    reconcileChatMessages(duplicate).quarantined[0].reason,
    'source_chat_message_path_not_unique',
  );
});

test('requires every source/target input and a valid reconciliation timestamp', () => {
  assert.throws(() => reconcileChatMessages({}), /must be an array/);
  assert.throws(() => reconcileChatMessages(baseInput({ reconciledAt: 'invalid' })), /reconciledAt/);
});
