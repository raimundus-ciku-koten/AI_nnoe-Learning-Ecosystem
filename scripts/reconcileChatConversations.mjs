import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const UUID_NAMESPACE = '2c386c12-4d98-5ec2-9d98-c0fbd2f935a1';
const DIRECTORY_FIELDS = ['role', 'tenantId', 'updatedAt'];
const META_REQUIRED_FIELDS = ['type', 'members', 'createdBy', 'createdAt'];
const META_OPTIONAL_FIELDS = ['name', 'names'];
const PROFILE_ROLES = [
  'superadmin',
  'admin_sekolah',
  'operator',
  'guru',
  'siswa',
  'ortu',
  'orang_tua',
  'demo',
];

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

const normalizeName = value =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';

const validateInput = input => {
  if (!isRecord(input)) {
    throw new TypeError('Input must be a JSON object.');
  }
  for (const field of [
    'chats',
    'chatDirectory',
    'profiles',
    'targetTenants',
    'targetConversations',
  ]) {
    if (!Array.isArray(input[field])) {
      throw new TypeError(`Input field "${field}" must be an array.`);
    }
  }
  if (!isValidIsoTimestamp(input.reconciledAt)) {
    throw new TypeError('Input field "reconciledAt" must be an ISO timestamp.');
  }
  return input;
};

const sameJson = (left, right) => {
  const canonicalize = value => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!isRecord(value)) return value;
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, canonicalize(value[key])]),
    );
  };
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
};

const sameConversation = (existing, proposal) =>
  existing.id === proposal.id &&
  existing.type === proposal.type &&
  existing.title === proposal.title &&
  existing.created_by === proposal.created_by &&
  Array.isArray(existing.participant_ids) &&
  sameJson([...existing.participant_ids].sort(), [...proposal.participant_ids].sort()) &&
  sameJson(existing.participant_names, proposal.participant_names) &&
  Date.parse(existing.created_at) === Date.parse(proposal.created_at);

const normalizeSourceChat = entry => {
  if (
    !isValidChatId(entry.chatId) ||
    !hasExactFields(entry.meta, META_REQUIRED_FIELDS, META_OPTIONAL_FIELDS)
  ) {
    return { error: 'source_chat_path_or_meta_fields_invalid' };
  }
  const { meta } = entry;
  if (
    !['direct', 'group'].includes(meta.type) ||
    !isRecord(meta.members) ||
    !isValidLegacyUid(meta.createdBy) ||
    !Number.isSafeInteger(meta.createdAt) ||
    meta.createdAt < 0 ||
    !Number.isFinite(new Date(meta.createdAt).getTime())
  ) {
    return { error: 'source_chat_meta_invalid' };
  }

  const legacyUids = Object.keys(meta.members).sort();
  if (
    legacyUids.length < 2 ||
    legacyUids.length > 50 ||
    legacyUids.some(uid => !isValidLegacyUid(uid) || meta.members[uid] !== true) ||
    !legacyUids.includes(meta.createdBy)
  ) {
    return { error: 'source_chat_members_invalid' };
  }
  if (meta.type === 'direct' && legacyUids.length !== 2) {
    return { error: 'source_direct_chat_members_invalid' };
  }
  if (meta.type === 'direct') {
    const expectedId = `d_${legacyUids.join('_')}`;
    if (entry.chatId !== expectedId) {
      return { error: 'source_direct_chat_id_mismatch' };
    }
  }

  let title = null;
  if (Object.hasOwn(meta, 'name')) {
    if (typeof meta.name !== 'string' || meta.name.length > 80) {
      return { error: 'source_chat_title_invalid' };
    }
    title = normalizeName(meta.name);
    if (!title || title.length > 80) return { error: 'source_chat_title_invalid' };
  }

  let names = {};
  if (Object.hasOwn(meta, 'names')) {
    if (!isRecord(meta.names)) return { error: 'source_chat_names_invalid' };
    const nameEntries = Object.entries(meta.names);
    if (nameEntries.some(([uid, name]) =>
      !isValidLegacyUid(uid) ||
      !legacyUids.includes(uid) ||
      typeof name !== 'string' ||
      name.length > 80
    )) {
      return { error: 'source_chat_names_invalid' };
    }
    names = Object.fromEntries(nameEntries);
  }

  return {
    chat: {
      chatId: entry.chatId,
      type: meta.type,
      title,
      legacyUids,
      names,
      creatorLegacyUid: meta.createdBy,
      createdAt: new Date(meta.createdAt).toISOString(),
    },
  };
};

const normalizeDirectoryEntry = entry => {
  if (
    !isValidLegacyUid(entry?.legacyUid) ||
    !hasExactFields(entry.data, DIRECTORY_FIELDS)
  ) {
    return null;
  }
  const { role, tenantId, updatedAt } = entry.data;
  if (
    typeof role !== 'string' ||
    role.length < 1 ||
    role.length > 40 ||
    typeof tenantId !== 'string' ||
    tenantId.length > 128 ||
    !Number.isSafeInteger(updatedAt) ||
    updatedAt < 0
  ) {
    return null;
  }
  return { legacyUid: entry.legacyUid, role, tenantId };
};

const sourceKeyFor = chatId => `chats/${chatId}/meta`;

export const chatConversationId = chatId =>
  deterministicUuid(sourceKeyFor(chatId));

export function reconcileChatConversations(input) {
  const {
    chats,
    chatDirectory,
    profiles,
    targetTenants,
    targetConversations,
  } = validateInput(input);
  const chatsById = indexBy(chats, entry => entry?.chatId);
  const directoriesByUid = indexBy(chatDirectory, entry => entry?.legacyUid);
  const profilesByLegacyUid = indexBy(profiles, profile => profile?.legacy_uid);
  const tenantsById = indexBy(targetTenants, tenant => tenant?.id);
  const targetsById = indexBy(targetConversations, conversation => conversation?.id);
  const proposals = [];
  const alreadyPresent = [];
  const quarantined = [];
  const quarantine = reason => quarantined.push({ reason });

  for (const entry of chats) {
    const normalizedResult = normalizeSourceChat(entry ?? {});
    if (normalizedResult.error) {
      quarantine(normalizedResult.error);
      continue;
    }
    const normalized = normalizedResult.chat;
    if ((chatsById.get(normalized.chatId) ?? []).length !== 1) {
      quarantine('source_chat_id_not_unique');
      continue;
    }

    const targetProfiles = new Map();
    let mappingError = null;
    for (const legacyUid of normalized.legacyUids) {
      const matches = profilesByLegacyUid.get(legacyUid) ?? [];
      if (matches.length !== 1) {
        mappingError = 'chat_participant_legacy_uid_not_unique';
        break;
      }
      const profile = matches[0];
      if (
        !isUuid(profile.id) ||
        profile.active !== true ||
        !PROFILE_ROLES.includes(profile.role) ||
        typeof profile.nama !== 'string' ||
        !normalizeName(profile.nama) ||
        normalizeName(profile.nama).length > 120 ||
        (profile.role === 'superadmin'
          ? profile.tenant_id !== null && profile.tenant_id !== ''
          : typeof profile.tenant_id !== 'string' || !profile.tenant_id.trim())
      ) {
        mappingError = 'chat_participant_profile_invalid';
        break;
      }
      if (profile.role !== 'superadmin') {
        const tenantMatches = tenantsById.get(profile.tenant_id) ?? [];
        if (tenantMatches.length !== 1 || tenantMatches[0].active !== true) {
          mappingError = 'chat_participant_active_tenant_not_verified';
          break;
        }
      }

      const directoryMatches = directoriesByUid.get(legacyUid) ?? [];
      if (directoryMatches.length !== 1) {
        mappingError = 'chat_directory_entry_not_unique';
        break;
      }
      const directory = normalizeDirectoryEntry(directoryMatches[0]);
      const expectedDirectoryTenant = profile.role === 'superadmin' ? '' : profile.tenant_id;
      if (
        !directory ||
        directory.role !== profile.role ||
        directory.tenantId !== expectedDirectoryTenant
      ) {
        mappingError = 'chat_directory_profile_mismatch';
        break;
      }
      targetProfiles.set(legacyUid, profile);
    }
    if (mappingError) {
      quarantine(mappingError);
      continue;
    }

    const creator = targetProfiles.get(normalized.creatorLegacyUid);
    const creatorDirectory = normalizeDirectoryEntry(
      directoriesByUid.get(normalized.creatorLegacyUid)[0],
    );
    if (!creator || !creatorDirectory) {
      quarantine('chat_creator_mapping_invalid');
      continue;
    }
    if (
      creator.role !== 'superadmin' &&
      normalized.legacyUids.some(legacyUid =>
        targetProfiles.get(legacyUid).tenant_id !== creator.tenant_id,
      )
    ) {
      quarantine('cross_tenant_chat_creator_not_superadmin');
      continue;
    }

    const participantIds = [...targetProfiles.values()]
      .map(profile => profile.id)
      .sort();
    const participantNames = Object.fromEntries(
      normalized.legacyUids
        .map(legacyUid => {
          const profile = targetProfiles.get(legacyUid);
          const sourceName = normalizeName(normalized.names[legacyUid]);
          return [
            profile.id,
            sourceName || normalizeName(profile.nama),
          ];
        })
        .sort(([left], [right]) => left.localeCompare(right)),
    );
    const proposal = {
      id: deterministicUuid(sourceKeyFor(normalized.chatId)),
      type: normalized.type,
      title: normalized.title,
      participant_ids: participantIds,
      participant_names: participantNames,
      created_by: creator.id,
      created_at: normalized.createdAt,
    };

    const targetMatches = targetsById.get(proposal.id) ?? [];
    if (targetMatches.length > 1) {
      quarantine('target_chat_conversation_id_not_unique');
      continue;
    }
    if (targetMatches.length === 1) {
      if (sameConversation(targetMatches[0], proposal)) {
        alreadyPresent.push(proposal.id);
      } else {
        quarantine('target_chat_conversation_metadata_conflict');
      }
      continue;
    }
    proposals.push(proposal);
  }

  return {
    mode: 'report-only',
    summary: {
      sourceChats: chats.length,
      chatDirectoryEntries: chatDirectory.length,
      profiles: profiles.length,
      targetTenants: targetTenants.length,
      targetConversations: targetConversations.length,
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
      'Usage: node scripts/reconcileChatConversations.mjs <local-minimal-input.json>',
    );
  }
  const report = reconcileChatConversations(JSON.parse(await readFile(inputPath, 'utf8')));
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
