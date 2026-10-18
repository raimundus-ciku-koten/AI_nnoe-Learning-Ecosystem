import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { chatConversationId } from './reconcileChatConversations.mjs';

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

const validateInput = input => {
  if (!isRecord(input)) {
    throw new TypeError('Input must be a JSON object.');
  }
  for (const field of ['receipts', 'profiles', 'targetConversations', 'targetReceipts']) {
    if (!Array.isArray(input[field])) {
      throw new TypeError(`Input field "${field}" must be an array.`);
    }
  }
  if (!isValidIsoTimestamp(input.reconciledAt)) {
    throw new TypeError('Input field "reconciledAt" must be an ISO timestamp.');
  }
  return input;
};

const receiptKey = (conversationId, userId) => `${conversationId}/${userId}`;

const sameReceipt = (existing, proposal) =>
  existing.conversation_id === proposal.conversation_id &&
  existing.user_id === proposal.user_id &&
  Date.parse(existing.last_read_at) === Date.parse(proposal.last_read_at);

export function reconcileChatReadReceipts(input) {
  const {
    receipts,
    profiles,
    targetConversations,
    targetReceipts,
    reconciledAt,
  } = validateInput(input);
  const sourceByPath = indexBy(receipts, entry =>
    isValidChatId(entry?.chatId) && isValidLegacyUid(entry?.legacyUid)
      ? `${entry.chatId}/${entry.legacyUid}`
      : null,
  );
  const profilesByLegacyUid = indexBy(profiles, profile => profile?.legacy_uid);
  const conversationsById = indexBy(targetConversations, conversation => conversation?.id);
  const targetReceiptsByKey = indexBy(
    targetReceipts,
    receipt => isUuid(receipt?.conversation_id) && isUuid(receipt?.user_id)
      ? receiptKey(receipt.conversation_id, receipt.user_id)
      : null,
  );
  const proposals = [];
  const alreadyPresent = [];
  const quarantined = [];
  const quarantine = reason => quarantined.push({ reason });
  const reconciledAtMs = Date.parse(reconciledAt);

  for (const entry of receipts) {
    const chatId = typeof entry?.chatId === 'string' ? entry.chatId : '';
    const legacyUid = typeof entry?.legacyUid === 'string' ? entry.legacyUid : '';
    if (!isValidChatId(chatId) || !isValidLegacyUid(legacyUid)) {
      quarantine('source_chat_read_receipt_path_invalid');
      continue;
    }
    if ((sourceByPath.get(`${chatId}/${legacyUid}`) ?? []).length !== 1) {
      quarantine('source_chat_read_receipt_path_not_unique');
      continue;
    }
    if (
      !Number.isSafeInteger(entry.value) ||
      entry.value < 0 ||
      !Number.isFinite(new Date(entry.value).getTime())
    ) {
      quarantine('source_chat_read_receipt_timestamp_invalid');
      continue;
    }
    if (entry.value > reconciledAtMs) {
      quarantine('source_chat_read_receipt_timestamp_in_future');
      continue;
    }

    const conversationId = chatConversationId(chatId);
    const conversationMatches = conversationsById.get(conversationId) ?? [];
    if (conversationMatches.length !== 1) {
      quarantine('target_chat_read_receipt_conversation_not_unique');
      continue;
    }
    const conversation = conversationMatches[0];
    if (
      !Array.isArray(conversation.participant_ids) ||
      conversation.participant_ids.length < 2 ||
      conversation.participant_ids.length > 50 ||
      conversation.participant_ids.some(id => !isUuid(id)) ||
      new Set(conversation.participant_ids).size !== conversation.participant_ids.length
    ) {
      quarantine('target_chat_read_receipt_conversation_invalid');
      continue;
    }

    const profileMatches = profilesByLegacyUid.get(legacyUid) ?? [];
    if (profileMatches.length !== 1) {
      quarantine('chat_read_receipt_user_legacy_uid_not_unique');
      continue;
    }
    const profile = profileMatches[0];
    if (
      !isUuid(profile.id) ||
      profile.active !== true ||
      profile.role === 'unprovisioned' ||
      !conversation.participant_ids.includes(profile.id)
    ) {
      quarantine('chat_read_receipt_user_not_active_conversation_participant');
      continue;
    }

    const proposal = {
      conversation_id: conversationId,
      user_id: profile.id,
      last_read_at: new Date(entry.value).toISOString(),
    };
    const key = receiptKey(proposal.conversation_id, proposal.user_id);
    const targetMatches = targetReceiptsByKey.get(key) ?? [];
    if (targetMatches.length > 1) {
      quarantine('target_chat_read_receipt_not_unique');
      continue;
    }
    if (targetMatches.length === 1) {
      if (sameReceipt(targetMatches[0], proposal)) {
        alreadyPresent.push(key);
      } else {
        quarantine('target_chat_read_receipt_metadata_conflict');
      }
      continue;
    }
    proposals.push(proposal);
  }

  return {
    mode: 'report-only',
    summary: {
      sourceReadReceipts: receipts.length,
      profiles: profiles.length,
      targetConversations: targetConversations.length,
      targetReadReceipts: targetReceipts.length,
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
    throw new Error(
      'Usage: node scripts/reconcileChatReadReceipts.mjs <local-minimal-input.json>',
    );
  }
  const report = reconcileChatReadReceipts(JSON.parse(await readFile(inputPath, 'utf8')));
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
