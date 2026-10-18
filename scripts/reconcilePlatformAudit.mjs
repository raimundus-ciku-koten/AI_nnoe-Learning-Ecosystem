import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const UUID_NAMESPACE = 'f6b6a3f2-2d14-5c4f-a0e9-6940d4e7a11b';

const normalizeText = value => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text && !['null', 'none', 'n/a'].includes(text.toLowerCase()) ? text : null;
};

const isUuid = value =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const isValidIsoTimestamp = value =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
  Number.isFinite(Date.parse(value));

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

const canonicalizeJson = value => {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, canonicalizeJson(value[key])]),
    );
  }
  return value;
};

const deterministicUuid = sourceDocumentId => {
  const namespace = Buffer.from(UUID_NAMESPACE.replaceAll('-', ''), 'hex');
  const digest = createHash('sha1')
    .update(namespace)
    .update(sourceDocumentId, 'utf8')
    .digest()
    .subarray(0, 16);
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const normalizeContext = data => {
  const context = {};
  for (const field of ['actorUid', 'role', 'tenantId']) {
    if (data[field] === undefined || data[field] === null) continue;
    if (typeof data[field] !== 'string') return null;
    const value = normalizeText(data[field]);
    if (value) context[field] = value;
  }
  return Object.keys(context).length ? context : null;
};

const validateInput = input => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Input must be a JSON object.');
  }
  for (const field of ['firestoreAuditEntries', 'profiles', 'targetAudits']) {
    if (!Array.isArray(input[field])) {
      throw new TypeError(`Input field "${field}" must be an array.`);
    }
  }
  return input;
};

export function reconcilePlatformAudit(input) {
  const { firestoreAuditEntries, profiles, targetAudits } = validateInput(input);
  const sourceById = indexBy(firestoreAuditEntries, entry =>
    normalizeText(entry.documentId),
  );
  const profilesByLegacyUid = indexBy(profiles, profile =>
    normalizeText(profile.legacy_uid),
  );
  const targetsById = indexBy(targetAudits, audit => normalizeText(audit.id));
  const proposals = [];
  const alreadyPresent = [];
  const quarantined = [];
  const observations = [];
  const quarantine = reason => quarantined.push({ reason });

  for (const entry of firestoreAuditEntries) {
    const sourceDocumentId = normalizeText(entry.documentId);
    if (!sourceDocumentId) {
      quarantine('source_document_id_missing');
      continue;
    }
    if ((sourceById.get(sourceDocumentId) ?? []).length !== 1) {
      quarantine('source_document_id_not_unique');
      continue;
    }
    const data = entry.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      quarantine('source_document_data_invalid');
      continue;
    }
    if (
      ['action', 'target'].some(
        field => typeof data[field] !== 'string' || !normalizeText(data[field]),
      )
    ) {
      quarantine('action_or_target_missing');
      continue;
    }
    const action = normalizeText(data.action);
    const target = normalizeText(data.target);
    if (
      action.length > 120 ||
      target.length > 160 ||
      /[\u0000-\u001f\u007f]/.test(action) ||
      /[\u0000-\u001f\u007f]/.test(target)
    ) {
      quarantine('action_or_target_invalid');
      continue;
    }
    if (!isValidIsoTimestamp(data.createdAt)) {
      quarantine('created_at_missing_or_invalid');
      continue;
    }
    const legacyContext = normalizeContext(data);
    if (
      ['actorUid', 'role', 'tenantId'].some(
        field => data[field] !== undefined && data[field] !== null && typeof data[field] !== 'string',
      )
    ) {
      quarantine('legacy_context_type_invalid');
      continue;
    }

    const actorUid = normalizeText(data.actorUid);
    const actorMatches = actorUid ? profilesByLegacyUid.get(actorUid) ?? [] : [];
    if (actorMatches.length > 1) {
      quarantine('actor_legacy_uid_not_unique');
      continue;
    }
    const actorId = actorMatches.length === 1 ? normalizeText(actorMatches[0].id) : null;
    if (actorId && !isUuid(actorId)) {
      quarantine('actor_profile_id_invalid');
      continue;
    }
    if (actorUid && !actorId) {
      observations.push({ reason: 'actor_legacy_uid_unlinked' });
    }

    const proposal = {
      id: deterministicUuid(sourceDocumentId),
      actor_id: actorId,
      action,
      target,
      before_value: null,
      after_value: null,
      created_at: new Date(data.createdAt).toISOString(),
      legacy_context: legacyContext,
    };
    const existing = targetsById.get(proposal.id) ?? [];
    if (existing.length > 1) {
      quarantine('target_audit_id_not_unique');
      continue;
    }
    if (existing.length === 1) {
      const row = existing[0];
      const sameContext =
        JSON.stringify(canonicalizeJson(row.legacy_context ?? null)) ===
        JSON.stringify(canonicalizeJson(proposal.legacy_context));
      if (
        row.actor_id === proposal.actor_id &&
        row.action === proposal.action &&
        row.target === proposal.target &&
        row.before_value == null &&
        row.after_value == null &&
        row.created_at &&
        Date.parse(row.created_at) === Date.parse(proposal.created_at) &&
        sameContext
      ) {
        alreadyPresent.push(proposal.id);
      } else {
        quarantine('deterministic_target_id_collision');
      }
      continue;
    }
    proposals.push(proposal);
  }

  return {
    mode: 'report-only',
    summary: {
      sourceEntries: firestoreAuditEntries.length,
      profiles: profiles.length,
      targetAudits: targetAudits.length,
      proposals: proposals.length,
      alreadyPresent: alreadyPresent.length,
      quarantined: quarantined.length,
      observations: observations.length,
    },
    proposals,
    alreadyPresent,
    quarantined,
    observations,
  };
}

async function runCli(argv) {
  const inputPath = argv[2];
  if (!inputPath || argv.length !== 3) {
    throw new Error('Usage: node scripts/reconcilePlatformAudit.mjs <local-minimal-input.json>');
  }
  const report = reconcilePlatformAudit(JSON.parse(await readFile(inputPath, 'utf8')));
  process.stdout.write(`${JSON.stringify({
    mode: report.mode,
    summary: report.summary,
    quarantineReasons: report.quarantined.reduce((counts, item) => {
      counts[item.reason] = (counts[item.reason] ?? 0) + 1;
      return counts;
    }, {}),
    observationReasons: report.observations.reduce((counts, item) => {
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
