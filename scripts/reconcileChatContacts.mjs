import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { idPribadi, ringkas } from '../web/src/utils/chatUtil.js';

const UUID_NAMESPACE = 'f59cf11f-2d59-5d4f-8bb1-7440742a778c';
const CONTACT_REQUIRED_FIELDS = ['from', 'to', 'status', 'names', 'createdAt'];
const CONTACT_OPTIONAL_FIELDS = ['updatedAt'];
const PROFILE_ROLES = [
  'superadmin',
  'admin_sekolah',
  'operator',
  'guru',
  'siswa',
  'ortu',
  'orang_tua',
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

const normalizeDirectoryEntry = entry => {
  if (
    !isValidLegacyUid(entry?.legacyUid) ||
    !hasExactFields(entry.data, ['role', 'tenantId', 'updatedAt'])
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

const normalizeContact = entry => {
  if (
    !isRecord(entry) ||
    typeof entry.pairId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,160}$/.test(entry.pairId) ||
    !hasExactFields(entry.data, CONTACT_REQUIRED_FIELDS, CONTACT_OPTIONAL_FIELDS)
  ) {
    return { error: 'source_chat_contact_fields_invalid' };
  }
  const { data } = entry;
  if (
    !isValidLegacyUid(data.from) ||
    !isValidLegacyUid(data.to) ||
    data.from === data.to ||
    entry.pairId !== idPribadi(data.from, data.to) ||
    !['pending', 'accepted'].includes(data.status) ||
    !isRecord(data.names) ||
    !Number.isSafeInteger(data.createdAt) ||
    data.createdAt < 0 ||
    !Number.isFinite(new Date(data.createdAt).getTime()) ||
    (Object.hasOwn(data, 'updatedAt') &&
      (!Number.isSafeInteger(data.updatedAt) ||
        data.updatedAt < data.createdAt ||
        !Number.isFinite(new Date(data.updatedAt).getTime())))
  ) {
    return { error: 'source_chat_contact_fields_invalid' };
  }
  const names = Object.entries(data.names);
  if (
    names.some(([uid, name]) =>
      ![data.from, data.to].includes(uid) ||
      typeof name !== 'string' ||
      name.length > 80
    )
  ) {
    return { error: 'source_chat_contact_names_invalid' };
  }
  return {
    contact: {
      pairId: entry.pairId,
      fromLegacyUid: data.from,
      toLegacyUid: data.to,
      status: data.status,
      sourceNames: Object.fromEntries(names),
      createdAt: new Date(data.createdAt).toISOString(),
      updatedAt: Object.hasOwn(data, 'updatedAt')
        ? new Date(data.updatedAt).toISOString()
        : null,
    },
  };
};

const validateInput = input => {
  if (!isRecord(input)) {
    throw new TypeError('Input must be a JSON object.');
  }
  for (const field of [
    'contacts',
    'chatDirectory',
    'profiles',
    'targetTenants',
    'targetContacts',
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

const canonicalPair = (fromUserId, toUserId) =>
  [fromUserId, toUserId].sort().join('/');

const stableJson = value => {
  if (Array.isArray(value)) return value.map(stableJson);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, stableJson(value[key])]),
  );
};

const sameContact = (existing, proposal) =>
  existing.id === proposal.id &&
  existing.from_user_id === proposal.from_user_id &&
  existing.to_user_id === proposal.to_user_id &&
  existing.status === proposal.status &&
  JSON.stringify(stableJson(existing.participant_names)) ===
    JSON.stringify(stableJson(proposal.participant_names)) &&
  Date.parse(existing.created_at) === Date.parse(proposal.created_at) &&
  (existing.updated_at === null && proposal.updated_at === null ||
    Date.parse(existing.updated_at) === Date.parse(proposal.updated_at));

export function reconcileChatContacts(input) {
  const {
    contacts,
    chatDirectory,
    profiles,
    targetTenants,
    targetContacts,
    reconciledAt,
  } = validateInput(input);
  const contactsById = indexBy(contacts, entry => entry?.pairId);
  const directoriesByUid = indexBy(chatDirectory, entry => entry?.legacyUid);
  const profilesByLegacyUid = indexBy(profiles, profile => profile?.legacy_uid);
  const tenantsById = indexBy(targetTenants, tenant => tenant?.id);
  const targetsById = indexBy(targetContacts, contact => contact?.id);
  const targetsByPair = indexBy(
    targetContacts,
    contact => isUuid(contact?.from_user_id) && isUuid(contact?.to_user_id)
      ? canonicalPair(contact.from_user_id, contact.to_user_id)
      : null,
  );
  const proposals = [];
  const alreadyPresent = [];
  const quarantined = [];
  const quarantine = reason => quarantined.push({ reason });
  const reconciledAtMs = Date.parse(reconciledAt);

  for (const entry of contacts) {
    const normalizedResult = normalizeContact(entry);
    if (normalizedResult.error) {
      quarantine(normalizedResult.error);
      continue;
    }
    const normalized = normalizedResult.contact;
    if ((contactsById.get(normalized.pairId) ?? []).length !== 1) {
      quarantine('source_chat_contact_pair_not_unique');
      continue;
    }
    if (
      Date.parse(normalized.createdAt) > reconciledAtMs ||
      (normalized.updatedAt && Date.parse(normalized.updatedAt) > reconciledAtMs)
    ) {
      quarantine('source_chat_contact_timestamp_in_future');
      continue;
    }

    const targetProfiles = new Map();
    let mappingError = null;
    for (const legacyUid of [normalized.fromLegacyUid, normalized.toLegacyUid]) {
      const matches = profilesByLegacyUid.get(legacyUid) ?? [];
      if (matches.length !== 1) {
        mappingError = 'chat_contact_profile_legacy_uid_not_unique';
        break;
      }
      const profile = matches[0];
      if (
        !isUuid(profile.id) ||
        profile.active !== true ||
        !PROFILE_ROLES.includes(profile.role) ||
        typeof profile.nama !== 'string' ||
        !profile.nama.trim() ||
        profile.nama.trim().length > 120 ||
        (profile.role === 'superadmin'
          ? profile.tenant_id !== null && profile.tenant_id !== ''
          : typeof profile.tenant_id !== 'string' || !profile.tenant_id.trim())
      ) {
        mappingError = 'chat_contact_profile_invalid';
        break;
      }
      if (profile.role !== 'superadmin') {
        const tenantMatches = tenantsById.get(profile.tenant_id) ?? [];
        if (tenantMatches.length !== 1 || tenantMatches[0].active !== true) {
          mappingError = 'chat_contact_active_tenant_not_verified';
          break;
        }
      }

      const directoryMatches = directoriesByUid.get(legacyUid) ?? [];
      if (directoryMatches.length !== 1) {
        mappingError = 'chat_contact_directory_entry_not_unique';
        break;
      }
      const directory = normalizeDirectoryEntry(directoryMatches[0]);
      const expectedTenant = profile.role === 'superadmin' ? '' : profile.tenant_id;
      if (
        !directory ||
        directory.role !== profile.role ||
        directory.tenantId !== expectedTenant
      ) {
        mappingError = 'chat_contact_directory_profile_mismatch';
        break;
      }
      targetProfiles.set(legacyUid, profile);
    }
    if (mappingError) {
      quarantine(mappingError);
      continue;
    }

    const sender = targetProfiles.get(normalized.fromLegacyUid);
    const recipient = targetProfiles.get(normalized.toLegacyUid);
    if (
      sender.role !== 'superadmin' &&
      sender.tenant_id !== recipient.tenant_id
    ) {
      quarantine('cross_tenant_contact_request_not_from_superadmin');
      continue;
    }

    const participantNames = Object.fromEntries(
      [
        [normalized.fromLegacyUid, sender],
        [normalized.toLegacyUid, recipient],
      ]
        .map(([legacyUid, profile]) => {
          const sourceName = normalized.sourceNames[legacyUid];
          return [
            profile.id,
            ringkas(sourceName?.trim() ? sourceName : profile.nama, 80),
          ];
        })
        .sort(([left], [right]) => left.localeCompare(right)),
    );
    const proposal = {
      id: deterministicUuid(`contacts/${normalized.pairId}`),
      from_user_id: sender.id,
      to_user_id: recipient.id,
      status: normalized.status,
      participant_names: participantNames,
      created_at: normalized.createdAt,
      updated_at: normalized.updatedAt,
    };

    const targetMatches = targetsById.get(proposal.id) ?? [];
    const pairMatches = targetsByPair.get(
      canonicalPair(proposal.from_user_id, proposal.to_user_id),
    ) ?? [];
    if (targetMatches.length > 1 || pairMatches.length > 1) {
      quarantine('target_chat_contact_not_unique');
      continue;
    }
    if (targetMatches.length === 1 || pairMatches.length === 1) {
      const existing = targetMatches[0] ?? pairMatches[0];
      if (sameContact(existing, proposal)) {
        alreadyPresent.push(proposal.id);
      } else {
        quarantine('target_chat_contact_metadata_conflict');
      }
      continue;
    }
    proposals.push(proposal);
  }

  return {
    mode: 'report-only',
    summary: {
      sourceContacts: contacts.length,
      chatDirectoryEntries: chatDirectory.length,
      profiles: profiles.length,
      targetTenants: targetTenants.length,
      targetContacts: targetContacts.length,
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
    throw new Error('Usage: node scripts/reconcileChatContacts.mjs <local-minimal-input.json>');
  }
  const report = reconcileChatContacts(JSON.parse(await readFile(inputPath, 'utf8')));
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
