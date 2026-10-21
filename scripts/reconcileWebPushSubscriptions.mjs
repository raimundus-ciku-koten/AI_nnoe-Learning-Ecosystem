import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isValidIsoTimestamp(value) {
  return typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

export function reconcileWebPushSubscriptions({
  legacyTokens,
  reconciledAt,
}) {
  if (!Array.isArray(legacyTokens)) {
    throw new TypeError('legacyTokens must be an array');
  }
  if (!isValidIsoTimestamp(reconciledAt)) {
    throw new TypeError('reconciledAt must be an ISO timestamp');
  }

  const quarantined = legacyTokens.map((record, sourceIndex) => {
    if (!isRecord(record) || typeof record.legacyUid !== 'string' || !record.legacyUid.trim()) {
      return { sourceIndex, reason: 'source_fcm_token_record_invalid' };
    }
    const { tokenKey, token } = record;
    if (
      typeof tokenKey !== 'string' ||
      tokenKey.length === 0 ||
      typeof token !== 'string' ||
      token.length === 0 ||
      token.length > 4096
    ) {
      return { sourceIndex, reason: 'source_fcm_token_invalid' };
    }
    if (tokenKey !== token.replace(/[.#$/\[\]]/g, '_')) {
      return { sourceIndex, reason: 'source_fcm_token_key_invalid' };
    }
    return {
      sourceIndex,
      reason: 'source_fcm_token_not_web_push_subscription',
    };
  });

  return {
    mode: 'report-only',
    reconciledAt: new Date(Date.parse(reconciledAt)).toISOString(),
    summary: {
      sourceTokens: legacyTokens.length,
      quarantined: quarantined.length,
      proposals: 0,
    },
    proposals: [],
    quarantined,
  };
}

async function runCli(argv) {
  const inputPath = argv[2];
  if (!inputPath || argv.length !== 3) {
    throw new Error(
      'Usage: node scripts/reconcileWebPushSubscriptions.mjs <local-minimal-input.json>',
    );
  }
  const report = reconcileWebPushSubscriptions(
    JSON.parse(await readFile(inputPath, 'utf8')),
  );
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
