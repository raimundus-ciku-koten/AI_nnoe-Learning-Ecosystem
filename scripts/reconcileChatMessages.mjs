import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { chatConversationId } from './reconcileChatConversations.mjs';

const UUID_NAMESPACE = 'bc20d7b4-7566-52d7-a77d-1a92bd12d9b3';
const MESSAGE_CORE_FIELDS = ['senderId', 'type', 'ts'];
const MAX_FILE_SIZE = 2 * 1024 * 1024;
const MAX_CIPHERTEXT_SIZE = 10489856;

const isRecord = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isUuid = value =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const isValidIsoTimestamp = value =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
  Number.isFinite(Date.parse(value));

const isValidLegacyUid = value =>
  typeof value === 'string' &&
  value.length >= 1 &&
  value.length <= 128 &&
  !/[.#$/[\]]/.test(value);

const isValidChatId = value =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(value);

const isValidMessageId = value =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(value);

const hasExactFields = (value, required, optional = []) =>
  isRecord(value) &&
  required.every(field => Object.hasOwn(value, field)) &&
  Object.keys(value).every(field => required.includes(field) || optional.includes(field));

const indexBy = (items, getKey) => {
  const index = new Map();
  for (const item of items) {
    const key = getKey(item);
    if (!key) continue;
    const values = index.get(key) ?? [];
    values.push(item);
    index.set(key, values);
  }
  return index;
};

const deterministicUuid = sourceKey => {
  const namespace = Buffer.from(UUID_NAMESPACE.replaceAll('-', ''), 'hex');
  const digest = createHash('sha1')
    .update(namespace)
    .update(sourceKey, 'utf8')
    .digest()
    .subarray(0, 16);
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const normalizeSourceMessage = entry => {
  if (
    !isValidChatId(entry?.chatId) ||
    !isValidMessageId(entry?.messageId) ||
    !isRecord(entry.data)
  ) {
    return { error: 'source_chat_message_path_invalid' };
  }

  const { data } = entry;
  if (
    !MESSAGE_CORE_FIELDS.every(field => Object.hasOwn(data, field)) ||
    !['text', 'image', 'file'].includes(data.type) ||
    !isValidLegacyUid(data.senderId) ||
    !Number.isSafeInteger(data.ts) ||
    data.ts < 0 ||
    !Number.isFinite(new Date(data.ts).getTime())
  ) {
    return { error: 'source_chat_message_fields_invalid' };
  }

  if (data.type === 'text') {
    if (
      !hasExactFields(data, [...MESSAGE_CORE_FIELDS, 'text']) ||
      typeof data.text !== 'string' ||
      data.text.length < 1 ||
      data.text.length > 2000
    ) {
      return { error: 'source_chat_text_message_invalid' };
    }
    return {
      message: {
        chatId: entry.chatId,
        messageId: entry.messageId,
        senderLegacyUid: data.senderId,
        type: 'text',
        body: data.text,
        sourceFilePath: null,
        fileName: null,
        fileSize: null,
        createdAt: new Date(data.ts).toISOString(),
      },
    };
  }

  if (
    !hasExactFields(
      data,
      [...MESSAGE_CORE_FIELDS, 'filePath', 'fileSize'],
      ['fileName'],
    ) ||
    typeof data.filePath !== 'string' ||
    data.filePath.length > 400 ||
    !Number.isSafeInteger(data.fileSize) ||
    data.fileSize < 1 ||
    data.fileSize > MAX_FILE_SIZE ||
    (Object.hasOwn(data, 'fileName') &&
      (typeof data.fileName !== 'string' || data.fileName.length > 200))
  ) {
    return { error: 'source_chat_attachment_message_invalid' };
  }

  const pathMatch =
    /^chat\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{1,160})\/([A-Za-z0-9_-]{1,128})$/.exec(
      data.filePath,
    );
  if (!pathMatch || pathMatch[1] !== data.senderId || pathMatch[2] !== entry.chatId) {
    return { error: 'source_chat_attachment_path_mismatch' };
  }

  return {
    message: {
      chatId: entry.chatId,
      messageId: entry.messageId,
      senderLegacyUid: data.senderId,
      type: data.type,
      body: null,
      sourceFilePath: data.filePath,
      fileName: Object.hasOwn(data, 'fileName') ? data.fileName : null,
      fileSize: data.fileSize,
      createdAt: new Date(data.ts).toISOString(),
    },
  };
};

const validateInput = input => {
  if (!isRecord(input)) {
    throw new TypeError('Input must be a JSON object.');
  }
  for (const field of [
    'messages',
    'profiles',
    'targetConversations',
    'attachmentCrosswalk',
    'targetDriveFiles',
    'targetDriveAccess',
    'targetDriveKeyEnvelopes',
    'targetEncryptionKeys',
    'targetTenants',
    'targetMessages',
  ]) {
    if (field === 'attachmentCrosswalk') continue;
    if (!Array.isArray(input[field])) {
      throw new TypeError(`Input field "${field}" must be an array.`);
    }
  }
  if (!isRecord(input.attachmentCrosswalk)) {
    throw new TypeError('Input field "attachmentCrosswalk" must be a verified mapping object.');
  }
  if (!isValidIsoTimestamp(input.reconciledAt)) {
    throw new TypeError('Input field "reconciledAt" must be an ISO timestamp.');
  }
  return input;
};

const sameMessage = (existing, proposal) =>
  existing.id === proposal.id &&
  existing.conversation_id === proposal.conversation_id &&
  existing.sender_id === proposal.sender_id &&
  existing.type === proposal.type &&
  existing.body === proposal.body &&
  existing.drive_file_index_id === proposal.drive_file_index_id &&
  existing.file_name === proposal.file_name &&
  existing.file_size === proposal.file_size &&
  Date.parse(existing.created_at) === Date.parse(proposal.created_at);

const validDriveFile = (file, sender, targetTenants) => {
  if (
    !isRecord(file) ||
    !isUuid(file.id) ||
    file.owner_id !== sender.id ||
    typeof file.tenant_id !== 'string' ||
    !file.tenant_id.trim() ||
    file.category !== 'communication' ||
    file.revoked_at !== null ||
    typeof file.drive_file_id !== 'string' ||
    file.drive_file_id.length < 1 ||
    file.drive_file_id.length > 256 ||
    typeof file.ciphertext_sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(file.ciphertext_sha256) ||
    !Number.isSafeInteger(file.ciphertext_size_bytes) ||
    file.ciphertext_size_bytes < 1 ||
    file.ciphertext_size_bytes > MAX_CIPHERTEXT_SIZE ||
    !Number.isInteger(file.encryption_version) ||
    file.encryption_version < 1 ||
    file.encryption_version > 32767
  ) {
    return false;
  }
  const tenants = targetTenants.filter(tenant => tenant?.id === file.tenant_id);
  if (tenants.length !== 1 || tenants[0].active !== true) return false;
  return sender.role === 'superadmin' || sender.tenant_id === file.tenant_id;
};

const activeDriveAccessValid = (entries, fileId, recipientId) => {
  const matches = entries.filter(entry =>
    entry?.file_id === fileId &&
    entry?.grantee_id === recipientId &&
    entry?.revoked_at === null,
  );
  return matches.length === 1 && ['read', 'write'].includes(matches[0].access_level);
};

const activeEnvelopeValid = (entries, keysByUser, fileId, recipientId) => {
  const matches = entries.filter(entry =>
    entry?.file_id === fileId &&
    entry?.recipient_id === recipientId &&
    entry?.revoked_at === null,
  );
  const keys = keysByUser.get(recipientId) ?? [];
  if (matches.length !== 1 || keys.length !== 1) return false;
  const envelope = matches[0];
  const key = keys[0];
  return typeof envelope.wrapped_data_key === 'string' &&
    envelope.wrapped_data_key.length >= 64 &&
    envelope.wrapped_data_key.length <= 4096 &&
    typeof envelope.recipient_key_fingerprint === 'string' &&
    /^[a-f0-9]{64}$/.test(envelope.recipient_key_fingerprint) &&
    envelope.recipient_key_fingerprint === key.fingerprint &&
    Number.isInteger(envelope.key_version) &&
    envelope.key_version > 0 &&
    envelope.key_version === key.key_version;
};

const validateAttachmentShare = (
  fileId,
  sender,
  conversation,
  targetDriveFiles,
  targetDriveAccess,
  targetDriveKeyEnvelopes,
  targetEncryptionKeys,
  targetTenants,
  sourceFileSize,
) => {
  const files = targetDriveFiles.filter(file => file?.id === fileId);
  if (
    files.length !== 1 ||
    !validDriveFile(files[0], sender, targetTenants) ||
    files[0].ciphertext_size_bytes < sourceFileSize
  ) {
    return 'target_chat_drive_file_invalid';
  }
  const file = files[0];
  const keysByUser = indexBy(targetEncryptionKeys, key => key?.user_id);
  for (const recipientId of conversation.participant_ids) {
    if (!activeEnvelopeValid(
      targetDriveKeyEnvelopes,
      keysByUser,
      file.id,
      recipientId,
    )) {
      return 'target_chat_drive_key_envelope_incomplete';
    }
    if (
      recipientId !== sender.id &&
      !activeDriveAccessValid(targetDriveAccess, file.id, recipientId)
    ) {
      return 'target_chat_drive_access_incomplete';
    }
  }
  return null;
};

export function reconcileChatMessages(input) {
  const {
    messages,
    profiles,
    targetConversations,
    attachmentCrosswalk,
    targetDriveFiles,
    targetDriveAccess,
    targetDriveKeyEnvelopes,
    targetEncryptionKeys,
    targetTenants,
    targetMessages,
  } = validateInput(input);
  const sourceByPath = indexBy(messages, entry =>
    isValidChatId(entry?.chatId) && isValidMessageId(entry?.messageId)
      ? `${entry.chatId}/messages/${entry.messageId}`
      : null,
  );
  const profilesByLegacyUid = indexBy(profiles, profile => profile?.legacy_uid);
  const conversationsById = indexBy(targetConversations, conversation => conversation?.id);
  const targetMessagesById = indexBy(targetMessages, message => message?.id);
  const proposals = [];
  const alreadyPresent = [];
  const quarantined = [];
  const quarantine = reason => quarantined.push({ reason });

  for (const entry of messages) {
    const normalizedResult = normalizeSourceMessage(entry ?? {});
    if (normalizedResult.error) {
      quarantine(normalizedResult.error);
      continue;
    }
    const normalized = normalizedResult.message;
    const sourcePath = `${normalized.chatId}/messages/${normalized.messageId}`;
    if ((sourceByPath.get(sourcePath) ?? []).length !== 1) {
      quarantine('source_chat_message_path_not_unique');
      continue;
    }

    const conversationId = chatConversationId(normalized.chatId);
    const conversationMatches = conversationsById.get(conversationId) ?? [];
    if (conversationMatches.length !== 1) {
      quarantine('target_chat_conversation_not_unique');
      continue;
    }
    const conversation = conversationMatches[0];
    if (
      !Array.isArray(conversation.participant_ids) ||
      conversation.participant_ids.length < 2 ||
      conversation.participant_ids.length > 50 ||
      new Set(conversation.participant_ids).size !== conversation.participant_ids.length
    ) {
      quarantine('target_chat_conversation_participants_invalid');
      continue;
    }

    const senderMatches = profilesByLegacyUid.get(normalized.senderLegacyUid) ?? [];
    if (senderMatches.length !== 1) {
      quarantine('chat_message_sender_legacy_uid_not_unique');
      continue;
    }
    const sender = senderMatches[0];
    if (
      !isUuid(sender.id) ||
      sender.active !== true ||
      sender.role === 'unprovisioned' ||
      !conversation.participant_ids.includes(sender.id)
    ) {
      quarantine('chat_message_sender_not_active_conversation_participant');
      continue;
    }

    let driveFileId = null;
    if (normalized.sourceFilePath !== null) {
      driveFileId = attachmentCrosswalk[normalized.sourceFilePath];
      if (!isUuid(driveFileId)) {
        quarantine('verified_chat_drive_attachment_crosswalk_missing');
        continue;
      }
      const attachmentError = validateAttachmentShare(
        driveFileId,
        sender,
        conversation,
        targetDriveFiles,
        targetDriveAccess,
        targetDriveKeyEnvelopes,
        targetEncryptionKeys,
        targetTenants,
        normalized.fileSize,
      );
      if (attachmentError) {
        quarantine(attachmentError);
        continue;
      }
    }

    const proposal = {
      id: deterministicUuid(`${normalized.chatId}/messages/${normalized.messageId}`),
      conversation_id: conversationId,
      sender_id: sender.id,
      type: normalized.type,
      body: normalized.body,
      drive_file_index_id: driveFileId,
      file_name: normalized.fileName,
      file_size: normalized.fileSize,
      created_at: normalized.createdAt,
    };

    const targetMatches = targetMessagesById.get(proposal.id) ?? [];
    if (targetMatches.length > 1) {
      quarantine('target_chat_message_id_not_unique');
      continue;
    }
    if (targetMatches.length === 1) {
      if (sameMessage(targetMatches[0], proposal)) {
        alreadyPresent.push(proposal.id);
      } else {
        quarantine('target_chat_message_metadata_conflict');
      }
      continue;
    }
    proposals.push(proposal);
  }

  return {
    mode: 'report-only',
    summary: {
      sourceMessages: messages.length,
      profiles: profiles.length,
      targetConversations: targetConversations.length,
      targetDriveFiles: targetDriveFiles.length,
      targetDriveAccess: targetDriveAccess.length,
      targetDriveKeyEnvelopes: targetDriveKeyEnvelopes.length,
      targetEncryptionKeys: targetEncryptionKeys.length,
      targetTenants: targetTenants.length,
      targetMessages: targetMessages.length,
      proposals: proposals.length,
      alreadyPresent: alreadyPresent.length,
      quarantined: quarantined.length,
    },
    proposals,
    alreadyPresent,
    quarantined,
  };
}

async function runCli(argv) {
  const inputPath = argv[2];
  if (!inputPath || argv.length !== 3) {
    throw new Error('Usage: node scripts/reconcileChatMessages.mjs <local-minimal-input.json>');
  }
  const report = reconcileChatMessages(JSON.parse(await readFile(inputPath, 'utf8')));
  process.stdout.write(`${JSON.stringify({
    mode: report.mode,
    summary: report.summary,
    quarantineReasons: report.quarantined.reduce((counts, item) => {
      counts[item.reason] = (counts[item.reason] ?? 0) + 1;
      return counts;
    }, {}),
  }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
