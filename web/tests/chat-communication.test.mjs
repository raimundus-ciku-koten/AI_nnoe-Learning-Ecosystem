import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CHAT_TABS, hitungLencanaTab } from '../src/views/chat/chatTabs.js';
import {
  CHAT_E2EE_NOT_READY_MESSAGE,
  assertChatE2EEReady,
} from '../src/services/featureFlags.js';
import {
  CALL_HISTORY_RETENTION_DAYS,
  MAX_CALL_HISTORY_ITEMS,
  CALL_RING_TIMEOUT_MS,
  catatPanggilan,
  muatRiwayatPanggilan,
  selesaikanPanggilan,
} from '../src/services/callHistory.js';

const migration = await readFile(
  new URL('../../supabase/migrations/20261102000100_chat_call_history.sql', import.meta.url),
  'utf8',
);
const appRoutes = await readFile(new URL('../src/app/RouteWrapper.jsx', import.meta.url), 'utf8');
const chatPage = await readFile(new URL('../src/pages/chat.js', import.meta.url), 'utf8');
const room = await readFile(new URL('../src/views/chat/chatRoom.js', import.meta.url), 'utf8');
const chatService = await readFile(new URL('../src/services/chat.js', import.meta.url), 'utf8');

const callerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const peerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const conversationId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const callId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function fakeClient(result) {
  const calls = [];
  const query = {};
  for (const method of [
    'select', 'insert', 'upsert', 'update', 'contains', 'gte', 'order', 'limit', 'eq', 'single', 'maybeSingle',
  ]) {
    query[method] = (...args) => {
      calls.push([method, ...args]);
      return ['upsert', 'limit', 'single', 'maybeSingle'].includes(method)
        ? Promise.resolve(result)
        : query;
    };
  }
  return {
    calls,
    from(table) {
      calls.push(['from', table]);
      return query;
    },
  };
}

test('communication tabs expose the requested five destinations in order', () => {
  assert.deepEqual(CHAT_TABS.map(({ label }) => label), [
    'Chat', 'Grup', 'Telepon', 'Video Call', 'Kontak',
  ]);
  assert.deepEqual(CHAT_TABS.map(({ href }) => href), [
    '#/chat', '#/chat/grup', '#/chat/telepon', '#/chat/video', '#/chat/kontak',
  ]);
  assert.deepEqual(hitungLencanaTab({
    chats: [{ type: 'direct', unread: 2 }, { type: 'group', unread: 3 }],
    permintaanMasuk: 1,
  }), { chat: 2, group: 3, kontak: 1 });
  assert.match(appRoutes, /path="\/chat\/telepon"/);
  assert.match(appRoutes, /path="\/chat\/video"/);
  assert.match(chatPage, /tampilkanHubKomunikasi\(wadah, 'telepon'\)/);
  assert.match(chatPage, /tampilkanHubKomunikasi\(wadah, 'video'\)/);
});

test('call history enforces a 90-day query window and bounded results', async () => {
  const now = Date.parse('2026-11-02T00:00:00.000Z');
  const startedAt = new Date(now - CALL_RING_TIMEOUT_MS - 1).toISOString();
  const client = fakeClient({
    data: [{ id: callId, outcome: 'ringing', started_at: startedAt }],
    error: null,
  });
  assert.equal(CALL_HISTORY_RETENTION_DAYS, 90);
  assert.equal(MAX_CALL_HISTORY_ITEMS, 100);
  assert.deepEqual(await muatRiwayatPanggilan(client, callerId, now), [
    { id: callId, outcome: 'missed', started_at: startedAt },
  ]);
  assert.deepEqual(client.calls, [
    ['from', 'chat_call_history'],
    ['select', 'id,conversation_id,started_by,participant_ids,media_kind,outcome,started_at,ended_at'],
    ['contains', 'participant_ids', [callerId]],
    ['gte', 'started_at', new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString()],
    ['order', 'started_at', { ascending: false }],
    ['limit', 100],
    ['from', 'chat_call_history'],
    ['update', { outcome: 'missed', ended_at: new Date(now).toISOString() }],
    ['eq', 'id', callId],
    ['eq', 'outcome', 'ringing'],
    ['select', 'id'],
    ['maybeSingle'],
  ]);
});

test('call history reconciliation only closes timed-out ringing calls', async () => {
  const now = Date.parse('2026-11-02T00:00:00.000Z');
  const timedOutAt = new Date(now - CALL_RING_TIMEOUT_MS).toISOString();
  const recentAt = new Date(now - CALL_RING_TIMEOUT_MS + 1).toISOString();
  const calls = [
    { id: callId, outcome: 'ringing', started_at: timedOutAt },
    { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', outcome: 'ringing', started_at: recentAt },
    { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', outcome: 'completed', started_at: timedOutAt },
  ];
  const client = fakeClient({ data: calls, error: null });
  const history = await muatRiwayatPanggilan(client, callerId, now);

  assert.equal(history[0].outcome, 'missed');
  assert.equal(history[1].outcome, 'ringing');
  assert.equal(history[2].outcome, 'completed');
  assert.deepEqual(client.calls.filter(([method]) => method === 'update'), [
    ['update', { outcome: 'missed', ended_at: new Date(now).toISOString() }],
  ]);
  assert.ok(client.calls.some(([method, column, value]) =>
    method === 'eq' && column === 'id' && value === callId));
  assert.ok(client.calls.some(([method, column, value]) =>
    method === 'eq' && column === 'outcome' && value === 'ringing'));
});

test('call history reports timeout reconciliation errors', async () => {
  const now = Date.now();
  const startedAt = new Date(now - CALL_RING_TIMEOUT_MS).toISOString();
  const client = fakeClient({ data: [{ id: callId, outcome: 'ringing', started_at: startedAt }], error: null });
  client.from = (table) => {
    const query = {
      select() { return this; },
      contains() { return this; },
      gte() { return this; },
      order() { return this; },
      limit() { return Promise.resolve({ data: [{ id: callId, outcome: 'ringing', started_at: startedAt }], error: null }); },
      update() { return this; },
      eq() { return this; },
      maybeSingle() { return Promise.resolve({ data: null, error: new Error('RLS denied') }); },
    };
    assert.equal(table, 'chat_call_history');
    return query;
  };

  await assert.rejects(() => muatRiwayatPanggilan(client, callerId, now), /RLS denied/);
});

test('call history mutations validate identifiers and deduplicate inbound call records', async () => {
  const client = fakeClient({ data: { id: callId }, error: null });
  assert.deepEqual(await catatPanggilan(client, {
    id: callId,
    conversationId,
    startedBy: callerId,
    participantIds: [callerId, peerId],
    mediaKind: 'video',
  }), { id: callId });
  assert.ok(client.calls.some(([method, value, options]) => method === 'upsert' &&
    value.outcome === 'ringing' && value.participant_ids.length === 2 &&
    options.onConflict === 'id' && options.ignoreDuplicates));

  await selesaikanPanggilan(client, callId, 'completed', '2026-11-02T00:01:00.000Z');
  assert.ok(client.calls.some(([method, value]) => method === 'update' &&
    value.outcome === 'completed' && value.ended_at));

  await assert.rejects(() => catatPanggilan(client, {
    id: callId,
    conversationId,
    startedBy: callerId,
    participantIds: [callerId],
    mediaKind: 'video',
  }), /Data riwayat panggilan tidak valid/);
  await assert.rejects(() => selesaikanPanggilan(client, callId, 'ringing'), /Status akhir/);

  const failed = fakeClient({ data: null, error: new Error('RLS denied') });
  await assert.rejects(() => muatRiwayatPanggilan(failed, callerId), /RLS denied/);
});

test('call history migration limits participants and enforces member-scoped RLS', () => {
  assert.match(migration, /create table if not exists public\.chat_call_history/);
  assert.match(migration, /cardinality\(p_participant_ids\) between 2 and 4/);
  assert.match(migration, /p_started_by = \(select auth\.uid\(\)\)/);
  assert.match(migration, /private\.chat_call_participants_are_valid/);
  assert.match(migration, /participant_ids @> array\[\(select auth\.uid\(\)\)\]/);
  assert.match(migration, /started_at >= now\(\) - interval '90 days'/);
  assert.match(migration, /revoke all on table public\.chat_call_history from public, anon, authenticated/);
  assert.match(migration, /delete from public\.chat_call_history\s+where started_at < now\(\) - interval '90 days'/i);
  assert.match(migration, /revoke all on function private\.delete_expired_chat_call_history\(\)\s+from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function private\.delete_expired_chat_call_history\(\)\s+to service_role/i);
  assert.match(migration, /drop policy if exists "Active participants record calls"[\s\S]*?started_by = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /drop policy if exists "Call participants finish call records"[\s\S]*?started_by = \(select auth\.uid\(\)\)[\s\S]*?participant_ids @> array\[\(select auth\.uid\(\)\)\][\s\S]*?outcome in \('completed', 'missed', 'rejected', 'cancelled', 'failed'\)/i);
  assert.doesNotMatch(migration, /for delete/i);
});

test('plaintext message and legacy attachment writers stay closed until E2EE is ready', () => {
  assert.throws(assertChatE2EEReady, new RegExp(CHAT_E2EE_NOT_READY_MESSAGE));
  assert.match(chatService, /export async function kirimPesan[\s\S]*?assertChatE2EEReady\(\)/);
  assert.match(chatService, /export async function unggahBerkas[\s\S]*?assertChatE2EEReady\(\)/);
});

test('chat calls are logged by the initiating device and shortcuts select media kind', () => {
  assert.match(room, /catatPanggilan\(supabase/);
  assert.match(room, /state\.status === 'incoming' && state\.callId/);
  assert.match(room, /state\.callId === ignoredIncomingCallId/);
  assert.match(room, /callHistoryStartedBy = saya/);
  assert.match(room, /startedBy: callHistoryStartedBy/);
  assert.match(room, /callEndReason = 'rejected'/);
  assert.match(room, /state\.outcome/);
  assert.match(room, /selesaikanPanggilan\(supabase/);
  assert.match(room, /mulaiPanggilanDariTab/);
  assert.match(chatPage, /callKind === 'audio' \|\| callKind === 'video'/);
});
