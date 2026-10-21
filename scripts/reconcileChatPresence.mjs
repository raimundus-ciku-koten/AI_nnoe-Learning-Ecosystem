import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

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
  for (const field of ['presenceRecords', 'profiles', 'targetPresence']) {
    if (!Array.isArray(input[field])) {
      throw new TypeError(`Input field "${field}" must be an array.`);
    }
  }
  if (!isValidIsoTimestamp(input.reconciledAt)) {
    throw new TypeError('Input field "reconciledAt" must be an ISO timestamp.');
  }
  return input;
};

const samePresence = (existing, proposal) =>
  existing.user_id === proposal.user_id &&
  Date.parse(existing.last_seen_at) === Date.parse(proposal.last_seen_at);

export function reconcileChatPresence(input) {
  const { presenceRecords, profiles, targetPresence, reconciledAt } = validateInput(input);
  const sourceByUid = indexBy(presenceRecords, entry => entry?.legacyUid);
  const profilesByLegacyUid = indexBy(profiles, profile => profile?.legacy_uid);
  const targetByUserId = indexBy(targetPresence, presence => presence?.user_id);
  const proposals = [];
  const alreadyPresent = [];
  const quarantined = [];
  const quarantine = reason => quarantined.push({ reason });
  const reconciledAtMs = Date.parse(reconciledAt);

  for (const entry of presenceRecords) {
    const legacyUid = typeof entry?.legacyUid === 'string' ? entry.legacyUid : '';
    if (!isValidLegacyUid(legacyUid)) {
      quarantine('source_chat_presence_uid_invalid');
      continue;
    }
    if ((sourceByUid.get(legacyUid) ?? []).length !== 1) {
      quarantine('source_chat_presence_uid_not_unique');
      continue;
    }
    if (
      !isRecord(entry.data) ||
      Object.keys(entry.data).sort().join(',') !== 'lastSeen,online' ||
      typeof entry.data.online !== 'boolean' ||
      !Number.isSafeInteger(entry.data.lastSeen) ||
      entry.data.lastSeen < 0 ||
      !Number.isFinite(new Date(entry.data.lastSeen).getTime())
    ) {
      quarantine('source_chat_presence_fields_invalid');
      continue;
    }
    if (entry.data.lastSeen > reconciledAtMs) {
      quarantine('source_chat_presence_timestamp_in_future');
      continue;
    }

    const profileMatches = profilesByLegacyUid.get(legacyUid) ?? [];
    if (profileMatches.length !== 1) {
      quarantine('chat_presence_profile_legacy_uid_not_unique');
      continue;
    }
    const profile = profileMatches[0];
    if (
      !isUuid(profile.id) ||
      profile.active !== true ||
      profile.role === 'unprovisioned'
    ) {
      quarantine('chat_presence_profile_invalid');
      continue;
    }

    const proposal = {
      user_id: profile.id,
      last_seen_at: new Date(entry.data.lastSeen).toISOString(),
    };
    const targetMatches = targetByUserId.get(proposal.user_id) ?? [];
    if (targetMatches.length > 1) {
      quarantine('target_chat_presence_user_not_unique');
      continue;
    }
    if (targetMatches.length === 1) {
      if (samePresence(targetMatches[0], proposal)) {
        alreadyPresent.push(proposal.user_id);
      } else {
        quarantine('target_chat_presence_timestamp_conflict');
      }
      continue;
    }
    proposals.push(proposal);
  }

  return {
    mode: 'report-only',
    summary: {
      sourcePresenceRecords: presenceRecords.length,
      profiles: profiles.length,
      targetPresence: targetPresence.length,
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
      'Usage: node scripts/reconcileChatPresence.mjs <local-minimal-input.json>',
    );
  }
  const report = reconcileChatPresence(JSON.parse(await readFile(inputPath, 'utf8')));
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
