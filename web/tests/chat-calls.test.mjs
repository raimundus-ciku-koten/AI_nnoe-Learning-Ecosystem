import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buatPengendaliPanggilan, ambilIceServers } from '../src/services/chatCalls.js';

const migration = await readFile(
  new URL('../../supabase/migrations/20261031000100_chat_call_signaling.sql', import.meta.url),
  'utf8',
);
const edgeFunction = await readFile(
  new URL('../../supabase/functions/chat-turn-credentials/index.ts', import.meta.url),
  'utf8',
);
const functionConfig = await readFile(
  new URL('../../supabase/config.toml', import.meta.url),
  'utf8',
);

const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const peerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const conversationId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const callId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function fakeSupabase() {
  const sent = [];
  let handler;
  const channel = {
    on(_type, _filter, callback) { handler = callback; return this; },
    subscribe(callback) { callback('SUBSCRIBED'); return this; },
    async send(message) { sent.push(message); return 'ok'; },
  };
  return {
    sent,
    channelName: null,
    channel(topic, config) {
      this.channelName = topic;
      this.config = config;
      return channel;
    },
    async removeChannel() {},
    receive(payload) { handler({ payload }); },
  };
}

function mockPeerConnection() {
  return {
    connectionState: 'new',
    localDescription: null,
    remoteDescription: null,
    addTrack() {},
    async createOffer() { return { type: 'offer', sdp: 'local-offer' }; },
    async createAnswer() { return { type: 'answer', sdp: 'local-answer' }; },
    async setLocalDescription(description) { this.localDescription = description; },
    async setRemoteDescription(description) { this.remoteDescription = description; },
    async addIceCandidate(candidate) { this.candidate = candidate; },
    close() { this.closed = true; },
  };
}

test('only allows private broadcast signaling for active conversation participants', () => {
  assert.match(migration, /on realtime\.messages[\s\S]*?for select[\s\S]*?to authenticated/i);
  assert.match(migration, /on realtime\.messages[\s\S]*?for insert[\s\S]*?to authenticated/i);
  assert.match(migration, /extension = 'broadcast'/);
  assert.match(migration, /realtime\.topic\(\)/);
  assert.match(migration, /realtime\.topic\(\)\) = 'chat-call:' \|\| conversation\.id::text/);
  assert.match(migration, /current_user_is_active\(\)/);
  assert.match(migration, /auth\.uid\(\)\) = any\(conversation\.participant_ids\)/);
  assert.match(migration, /conversation\.type = 'direct'/);
  assert.match(migration, /contact\.status = 'accepted'/);
  assert.doesNotMatch(migration, /alter table realtime\.messages/i);
});

test('TURN credentials require verified JWT, active conversation membership, and server-only secrets', () => {
  assert.match(functionConfig, /\[functions\.chat-turn-credentials\]\s+verify_jwt = true/);
  assert.match(edgeFunction, /supabase\.auth\.getUser\(token\)/);
  assert.match(edgeFunction, /conversation\.participant_ids\.includes\(authData\.user\.id\)/);
  assert.match(edgeFunction, /conversation\.type !== 'direct'/);
  assert.match(edgeFunction, /profile\?\.active/);
  assert.match(edgeFunction, /claims\.active !== true/);
  assert.match(edgeFunction, /tenants'[\s\S]*?\.eq\('active', true\)/);
  assert.match(edgeFunction, /TURN_SHARED_SECRET/);
  assert.match(edgeFunction, /crypto\.subtle\.sign\('HMAC'/);
  assert.match(edgeFunction, /hash: 'SHA-1'/);
  assert.doesNotMatch(edgeFunction, /TURN_SHARED_SECRET[\s\S]{0,80}VITE_/);
});

test('fetches ICE servers only through the authenticated Edge Function', async () => {
  const supabase = {
    functions: {
      async invoke(name, options) {
        assert.equal(name, 'chat-turn-credentials');
        assert.deepEqual(options.body, { conversationId });
        return { data: { iceServers: [{ urls: ['turn:turn.example.test:3478'] }] }, error: null };
      },
    },
  };
  assert.deepEqual(await ambilIceServers(supabase, conversationId), [
    { urls: ['turn:turn.example.test:3478'] },
  ]);
});

test('outgoing calls use a private conversation topic and clean up media on hangup', async () => {
  const supabase = fakeSupabase();
  const peer = mockPeerConnection();
  let stopped = 0;
  const controller = buatPengendaliPanggilan({
    supabase,
    conversationId,
    userId,
    peerIds: [peerId],
    buatPeerConnection: () => peer,
    buatId: () => callId,
    getUserMedia: async () => ({ getTracks: () => [{ stop() { stopped += 1; } }] }),
  });

  await controller.mulai('video', peerId, [{ urls: ['turn:turn.example.test:3478'] }]);
  assert.equal(supabase.channelName, `chat-call:${conversationId}`);
  assert.deepEqual(supabase.config, { config: { private: true } });
  assert.equal(controller.state.status, 'ringing');
  assert.equal(supabase.sent[0].payload.type, 'offer');
  assert.equal(supabase.sent[0].payload.recipientId, peerId);

  await controller.akhiri();
  assert.equal(controller.state.status, 'idle');
  assert.equal(supabase.sent.at(-1).payload.type, 'end');
  assert.equal(peer.closed, true);
  assert.equal(stopped, 1);
});

test('accepts valid incoming calls, buffers ICE, and rejects signals from nonparticipants', async () => {
  const supabase = fakeSupabase();
  const peer = mockPeerConnection();
  const controller = buatPengendaliPanggilan({
    supabase,
    conversationId,
    userId,
    peerIds: [peerId],
    buatPeerConnection: () => peer,
    getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }),
  });
  await controller.hubungkan();

  supabase.receive({
    type: 'offer',
    callId,
    senderId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    recipientId: userId,
    kind: 'audio',
    description: { type: 'offer', sdp: 'untrusted-offer' },
  });
  assert.equal(controller.state.status, 'idle');

  supabase.receive({
    type: 'offer',
    callId,
    senderId: peerId,
    recipientId: userId,
    kind: 'audio',
    description: { type: 'offer', sdp: 'remote-offer' },
  });
  assert.equal(controller.state.status, 'incoming');
  supabase.receive({
    type: 'candidate',
    callId,
    senderId: peerId,
    recipientId: userId,
    candidate: { candidate: 'remote-candidate' },
  });
  await controller.terima([{ urls: ['turn:turn.example.test:3478'] }]);

  assert.equal(peer.remoteDescription.sdp, 'remote-offer');
  assert.equal(peer.candidate.candidate, 'remote-candidate');
  assert.equal(supabase.sent[0].payload.type, 'answer');
  assert.equal(controller.state.status, 'connecting');

  peer.ontrack({ streams: [{ id: 'remote-media' }] });
  assert.equal(controller.state.status, 'connected');
  assert.equal(controller.state.remoteStream.id, 'remote-media');
  await controller.dispose();
});
