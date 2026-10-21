import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const normalizeEmail = value => {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email && !['null', 'none', 'n/a'].includes(email) ? email : null;
};

const normalizeText = value =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

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
  const fields = [
    'firebaseAuthUsers',
    'firestoreUsers',
    'directory',
    'supabaseUsers',
    'profiles',
  ];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Input must be a JSON object.');
  }
  for (const field of fields) {
    if (!Array.isArray(input[field])) {
      throw new TypeError(`Input field "${field}" must be an array.`);
    }
  }
  return input;
};

export function reconcileProfiles(input) {
  const {
    firebaseAuthUsers,
    firestoreUsers,
    directory,
    supabaseUsers,
    profiles,
    tenantCrosswalk = {},
  } = validateInput(input);
  if (
    !tenantCrosswalk ||
    typeof tenantCrosswalk !== 'object' ||
    Array.isArray(tenantCrosswalk)
  ) {
    throw new TypeError('Input field "tenantCrosswalk" must be an object when provided.');
  }

  const usersByUid = indexBy(firestoreUsers, user =>
    normalizeText(user.data?.uid) ?? normalizeText(user.documentId),
  );
  const firebaseAuthByEmail = indexBy(firebaseAuthUsers, user =>
    normalizeEmail(user.email),
  );
  const supabaseUsersByEmail = indexBy(supabaseUsers, user =>
    normalizeEmail(user.email),
  );
  const profilesById = indexBy(profiles, profile => normalizeText(profile.id));
  const directoryByUid = indexBy(directory, entry =>
    normalizeText(entry.data?.uid) ?? normalizeText(entry.documentId),
  );

  const proposals = [];
  const quarantined = [];
  const observations = [];
  const matchedSupabaseIds = new Set();

  const quarantine = reason => quarantined.push({ reason });

  for (const authUser of firebaseAuthUsers) {
    const uid = normalizeText(authUser.uid);
    const email = normalizeEmail(authUser.email);
    const emailMatches = email ? firebaseAuthByEmail.get(email) ?? [] : [];
    if (!uid || !email) {
      quarantine('firebase_auth_missing_uid_or_email');
      continue;
    }
    if (emailMatches.length !== 1) {
      quarantine('firebase_auth_email_not_unique');
      continue;
    }
    if (authUser.emailVerified !== true) {
      quarantine('firebase_email_not_verified');
      continue;
    }

    const sourceUsers = usersByUid.get(uid) ?? [];
    if (sourceUsers.length !== 1) {
      quarantine(sourceUsers.length ? 'firestore_user_uid_not_unique' : 'firestore_user_missing');
      continue;
    }
    const sourceUser = sourceUsers[0];
    const sourceDocumentId = normalizeText(sourceUser.documentId);
    const sourceUid = normalizeText(sourceUser.data?.uid);
    if (sourceDocumentId && sourceDocumentId !== uid) {
      quarantine('firestore_document_uid_mismatch');
      continue;
    }
    if (sourceUid && sourceUid !== uid) {
      quarantine('firestore_field_uid_mismatch');
      continue;
    }
    const sourceEmail = normalizeEmail(sourceUser.data?.email);
    if (sourceEmail && sourceEmail !== email) {
      quarantine('firebase_firestore_email_mismatch');
      continue;
    }

    const targetAuthMatches = supabaseUsersByEmail.get(email) ?? [];
    if (targetAuthMatches.length !== 1) {
      quarantine(targetAuthMatches.length ? 'supabase_auth_email_not_unique' : 'supabase_auth_user_missing');
      continue;
    }
    const targetAuthUser = targetAuthMatches[0];
    const targetId = normalizeText(targetAuthUser.id);
    if (!targetId || !targetAuthUser.emailConfirmedAt) {
      quarantine('supabase_identity_missing_or_unconfirmed');
      continue;
    }
    const targetProfiles = profilesById.get(targetId) ?? [];
    if (targetProfiles.length !== 1) {
      quarantine(targetProfiles.length ? 'supabase_profile_not_unique' : 'supabase_profile_missing');
      continue;
    }
    const targetProfile = targetProfiles[0];

    const targetProfileEmail = normalizeEmail(targetProfile.email);
    if (targetProfileEmail && targetProfileEmail !== email) {
      quarantine('supabase_profile_email_mismatch');
      continue;
    }

    const sourceRole = normalizeText(sourceUser.data?.role);
    const targetRole = normalizeText(targetProfile.role);
    const claimedRole = normalizeText(authUser.customClaims?.role);
    if (
      (sourceRole && targetRole && sourceRole !== targetRole) ||
      (claimedRole && targetRole && claimedRole !== targetRole) ||
      (sourceRole && claimedRole && sourceRole !== claimedRole)
    ) {
      quarantine('role_conflict');
      continue;
    }

    const claimedTenant = normalizeText(authUser.customClaims?.tenantId);
    const fallbackSchoolId = normalizeText(authUser.customClaims?.sekolahId);
    const firestoreTenant = normalizeText(sourceUser.data?.tenantId);
    const targetTenant = normalizeText(targetProfile.tenant_id);
    if (claimedTenant && firestoreTenant && claimedTenant !== firestoreTenant) {
      quarantine('firebase_tenant_claim_firestore_conflict');
      continue;
    }
    if (!claimedTenant && firestoreTenant && !fallbackSchoolId) {
      quarantine('tenant_claim_missing');
      continue;
    }
    if (!claimedTenant && fallbackSchoolId && !normalizeText(tenantCrosswalk[fallbackSchoolId])) {
      quarantine('school_fallback_requires_verified_crosswalk');
      continue;
    }
    const sourceTenant = claimedTenant ?? fallbackSchoolId;
    const mappedTenant = sourceTenant
      ? normalizeText(tenantCrosswalk[sourceTenant]) ?? sourceTenant
      : null;
    if (mappedTenant !== targetTenant) {
      quarantine('tenant_requires_verified_crosswalk');
      continue;
    }
    if (!sourceTenant && sourceRole !== 'superadmin') {
      quarantine('tenant_source_missing');
      continue;
    }

    if (
      typeof sourceUser.data?.aktif === 'boolean' &&
      typeof targetProfile.active === 'boolean' &&
      sourceUser.data.aktif !== targetProfile.active
    ) {
      quarantine('active_state_conflict');
      continue;
    }

    if (authUser.disabled === true && targetProfile.active === true) {
      quarantine('disabled_firebase_user_is_active_in_target');
      continue;
    }

    const existingLegacyUid = normalizeText(targetProfile.legacy_uid);
    if (existingLegacyUid && existingLegacyUid !== uid) {
      quarantine('legacy_uid_conflict');
      continue;
    }
    if (!existingLegacyUid) {
      quarantine('supabase_legacy_uid_crosswalk_missing_requires_manual_review');
      continue;
    }

    matchedSupabaseIds.add(targetId);

    const directoryEntries = directoryByUid.get(uid) ?? [];
    if (directoryEntries.length > 1) {
      observations.push({ reason: 'directory_entry_not_unique' });
    }
    const sourceName = normalizeText(sourceUser.data?.nama);
    const targetName = normalizeText(targetProfile.nama);
    if (sourceName && targetName && sourceName !== targetName) {
      observations.push({ reason: 'name_differs_target_preserved' });
    }
  }

  for (const user of supabaseUsers) {
    const id = normalizeText(user.id);
    const email = normalizeEmail(user.email);
    if (id && email && !matchedSupabaseIds.has(id)) {
      observations.push({ reason: 'target_identity_not_matched' });
    }
  }

  return {
    mode: 'report-only',
    summary: {
      firebaseAuthUsers: firebaseAuthUsers.length,
      firestoreUsers: firestoreUsers.length,
      directoryEntries: directory.length,
      supabaseUsers: supabaseUsers.length,
      profiles: profiles.length,
      proposals: proposals.length,
      quarantined: quarantined.length,
      observations: observations.length,
    },
    proposals,
    quarantined,
    observations,
  };
}

async function runCli(argv) {
  const inputPath = argv[2];
  if (!inputPath || argv.length !== 3) {
    throw new Error('Usage: node scripts/reconcileProfiles.mjs <local-minimal-input.json>');
  }
  const input = JSON.parse(await readFile(inputPath, 'utf8'));
  const report = reconcileProfiles(input);
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
