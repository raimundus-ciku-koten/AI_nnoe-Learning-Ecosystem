import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileChatPresence } from '../../scripts/reconcileChatPresence.mjs';

const userId = '11111111-1111-4111-8111-111111111111';

const makeInput = overrides => ({
  presenceRecords: [{
    legacyUid: 'legacy-user',
    data: { online: false, lastSeen: 1760000000000 },
  }],
  profiles: [{
    id: userId,
    legacy_uid: 'legacy-user',
    role: 'guru',
    tenant_id: 'school-a',
    active: true,
  }],
  targetPresence: [],
  reconciledAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

test('maps only durable last-seen time and does not preserve stale online flags', () => {
  const report = reconcileChatPresence(makeInput());
  assert.equal(report.mode, 'report-only');
  assert.equal(report.summary.proposals, 1);
  assert.deepEqual(report.proposals[0], {
    user_id: userId,
    last_seen_at: '2025-10-09T08:53:20.000Z',
  });
  assert.equal(Object.hasOwn(report.proposals[0], 'online'), false);
  assert.equal(JSON.stringify(report).includes('legacy-user'), false);

  const online = makeInput();
  online.presenceRecords[0].data.online = true;
  assert.deepEqual(
    reconcileChatPresence(online).proposals,
    report.proposals,
  );
});

test('quarantines malformed fields, future timestamps and non-unique source UIDs', () => {
  const extra = makeInput();
  extra.presenceRecords[0].data.extra = true;
  assert.equal(
    reconcileChatPresence(extra).quarantined[0].reason,
    'source_chat_presence_fields_invalid',
  );

  const invalidBoolean = makeInput();
  invalidBoolean.presenceRecords[0].data.online = 'true';
  assert.equal(
    reconcileChatPresence(invalidBoolean).quarantined[0].reason,
    'source_chat_presence_fields_invalid',
  );

  const future = makeInput({ reconciledAt: '2025-10-01T00:00:00Z' });
  assert.equal(
    reconcileChatPresence(future).quarantined[0].reason,
    'source_chat_presence_timestamp_in_future',
  );

  const duplicate = makeInput();
  duplicate.presenceRecords.push({ ...duplicate.presenceRecords[0] });
  assert.equal(
    reconcileChatPresence(duplicate).quarantined[0].reason,
    'source_chat_presence_uid_not_unique',
  );
});

test('requires one active profile mapping and handles idempotence or target conflict', () => {
  const missing = reconcileChatPresence(makeInput({ profiles: [] }));
  assert.equal(
    missing.quarantined[0].reason,
    'chat_presence_profile_legacy_uid_not_unique',
  );

  const inactive = makeInput();
  inactive.profiles[0].active = false;
  assert.equal(
    reconcileChatPresence(inactive).quarantined[0].reason,
    'chat_presence_profile_invalid',
  );

  const proposal = reconcileChatPresence(makeInput()).proposals[0];
  const same = reconcileChatPresence(makeInput({ targetPresence: [{ ...proposal }] }));
  assert.equal(same.summary.alreadyPresent, 1);

  const conflict = reconcileChatPresence(makeInput({
    targetPresence: [{ ...proposal, last_seen_at: '2025-10-08T08:53:20.000Z' }],
  }));
  assert.equal(
    conflict.quarantined[0].reason,
    'target_chat_presence_timestamp_conflict',
  );
});

test('requires input arrays and a valid reconciliation timestamp', () => {
  assert.throws(() => reconcileChatPresence({}), /must be an array/);
  assert.throws(() => reconcileChatPresence(makeInput({ reconciledAt: 'invalid' })), /reconciledAt/);
});
