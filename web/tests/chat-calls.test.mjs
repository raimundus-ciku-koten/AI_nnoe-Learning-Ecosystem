import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buatPengendaliPanggilan,
  buatPengendaliPanggilanGrup,
  ambilIceServers,
  MAKS_ANGGOTA_PANGGILAN_GRUP,
} from '../src/services/chatCalls.js';

const migration = await readFile(
  new URL('../../supabase/migrations/20261031000100_chat_call_signaling.sql', import.meta.url),
  'utf8',
);
const groupCallMigration = await readFile(
  new URL('../../supabase/migrations/20261101000100_group_call_authorization.sql', import.meta.url),
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
  const senders = [];
  return {
    connectionState: 'new',
    localDescription: null,
    remoteDescription: null,
    addTrack(track) {
      const sender = {
        track,
        async replaceTrack(nextTrack) { this.track = nextTrack; },
      };
      senders.push(sender);
      return sender;
    },
    getSenders() { return senders; },
    async createOffer() { return { type: 'offer', sdp: 'local-offer' }; },
    async createAnswer() { return { type: 'answer', sdp: 'local-answer' }; },
    async setLocalDescription(description) { this.localDescription = description; },
    async setRemoteDescription(description) { this.remoteDescription = description; },
    async addIceCandidate(candidate) { this.candidate = candidate; },
    close() { this.closed = true; },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

function fakeRealtimeRoom() {
  const subscribers = [];
  const messages = [];
  const createSupabase = () => ({
    channel(topic, config) {
      const subscriber = {
        topic,
        config,
        handler: null,
        on(_type, _filter, callback) { this.handler = callback; return this; },
        subscribe(callback) {
          subscribers.push(this);
          callback('SUBSCRIBED');
          return this;
        },
        async send(message) {
          messages.push(message.payload);
          queueMicrotask(() => {
            for (const recipient of subscribers) recipient.handler?.({ payload: message.payload });
          });
          return 'ok';
        },
      };
      return subscriber;
    },
    async removeChannel(channel) {
      const index = subscribers.indexOf(channel);
      if (index >= 0) subscribers.splice(index, 1);
    },
  });
  return { createSupabase, messages };
}

async function drainRealtime() {
  for (let index = 0; index < 12; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function createGroupController({
  supabase,
  id,
  peerIds,
  peerConnections,
  tracks = [{ kind: 'audio', enabled: true, stop() {} }],
  getUserMedia,
}) {
  const localStream = {
    tracks: [...tracks],
    getTracks() { return this.tracks; },
    getVideoTracks() { return this.tracks.filter((track) => track.kind === 'video'); },
    removeTrack(track) { this.tracks = this.tracks.filter((current) => current !== track); },
    addTrack(track) { this.tracks.push(track); },
  };
  return buatPengendaliPanggilanGrup({
    supabase,
    conversationId,
    userId: id,
    peerIds,
    buatId: () => callId,
    buatPeerConnection: (configuration) => {
      const peer = mockPeerConnection();
      peer.configuration = configuration;
      peerConnections.push(peer);
      return peer;
    },
    getUserMedia: getUserMedia || (async () => localStream),
  });
}

function mediaTrack(kind, facingMode = undefined) {
  return {
    kind,
    enabled: true,
    stopped: false,
    settings: { facingMode },
    getSettings() { return this.settings; },
    stop() { this.stopped = true; },
    addEventListener() {},
    removeEventListener() {},
  };
}

function mediaStream(tracks) {
  return {
    tracks: [...tracks],
    getTracks() { return this.tracks; },
    getVideoTracks() { return this.tracks.filter((track) => track.kind === 'video'); },
    removeTrack(track) { this.tracks = this.tracks.filter((current) => current !== track); },
    addTrack(track) { this.tracks.push(track); },
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
  const directAuthorization = edgeFunction
    .split("if (conversation.type === 'direct')")[1]
    ?.split("} else if (conversation.type !== 'group'")[0];
  assert.ok(directAuthorization);
  assert.match(directAuthorization, /if \(!contact\)/);
  assert.match(edgeFunction, /conversation\.type === 'direct'/);
  assert.match(edgeFunction, /conversation\.type !== 'group'/);
  assert.match(edgeFunction, /participant_ids\.length > 4/);
  const groupAuthorization = edgeFunction
    .split("} else if (conversation.type !== 'group'")[1]
    ?.split('const { data: profile')[0];
  assert.ok(groupAuthorization);
  assert.doesNotMatch(groupAuthorization, /^\s*if \(!contact\)/m);
  assert.match(edgeFunction, /profile\?\.active/);
  assert.match(edgeFunction, /claims\.active !== true/);
  assert.match(edgeFunction, /tenants'[\s\S]*?\.eq\('active', true\)/);
  assert.match(edgeFunction, /TURN_SHARED_SECRET/);
  assert.match(edgeFunction, /crypto\.subtle\.sign\('HMAC'/);
  assert.match(edgeFunction, /hash: 'SHA-1'/);
  assert.doesNotMatch(edgeFunction, /TURN_SHARED_SECRET[\s\S]{0,80}VITE_/);
});

test('group-call signaling allows only active participants in mesh groups of at most four', () => {
  assert.match(groupCallMigration, /on realtime\.messages[\s\S]*?for select[\s\S]*?to authenticated/i);
  assert.match(groupCallMigration, /on realtime\.messages[\s\S]*?for insert[\s\S]*?to authenticated/i);
  assert.match(groupCallMigration, /current_user_is_active\(\)/);
  assert.match(groupCallMigration, /auth\.uid\(\)\) = any\(conversation\.participant_ids\)/);
  assert.match(groupCallMigration, /conversation\.type = 'group'[\s\S]*?cardinality\(conversation\.participant_ids\) between 2 and 4/);
  assert.match(groupCallMigration, /conversation\.type = 'direct'[\s\S]*?contact\.status = 'accepted'/);
  assert.doesNotMatch(groupCallMigration, /alter table realtime\.messages/i);
});

test('group rejection removes only that invite and ends as rejected when all decline', async () => {
  const room = fakeRealtimeRoom();
  const controllers = [];
  const peerConnections = [[], [], []];
  const thirdId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const ids = [userId, peerId, thirdId];
  for (let index = 0; index < ids.length; index += 1) {
    const controller = createGroupController({
      supabase: room.createSupabase(),
      id: ids[index],
      peerIds: ids.filter((id) => id !== ids[index]),
      peerConnections: peerConnections[index],
    });
    controllers.push(controller);
    await controller.hubungkan();
  }

  await controllers[0].mulaiGrup('audio', []);
  await drainRealtime();
  await controllers[1].tolak();
  await drainRealtime();
  assert.equal(controllers[0].state.status, 'ringing');
  assert.deepEqual(controllers[0].state.invitedPeerIds, [thirdId]);

  await controllers[2].tolak();
  await drainRealtime();

  assert.equal(controllers[1].state.status, 'idle');
  assert.equal(controllers[2].state.status, 'idle');
  assert.equal(controllers[0].state.status, 'idle');
  assert.equal(controllers[0].state.callId, callId);
  assert.equal(controllers[0].state.outcome, 'rejected');
  assert.ok(room.messages.some((message) => message.type === 'reject' &&
    message.senderId === peerId && message.recipientId === userId));

  await Promise.all(controllers.map((controller) => controller.dispose()));
});

test('a participant leaving a group closes only that participant mesh links', async () => {
  const room = fakeRealtimeRoom();
  const ids = [
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  ];
  const peerConnections = ids.map(() => []);
  const controllers = [];
  for (let index = 0; index < ids.length; index += 1) {
    const controller = createGroupController({
      supabase: room.createSupabase(),
      id: ids[index],
      peerIds: ids.filter((id) => id !== ids[index]),
      peerConnections: peerConnections[index],
    });
    controllers.push(controller);
    await controller.hubungkan();
  }

  const iceServers = [{ urls: ['turn:turn.example.test:3478'] }];
  await controllers[0].mulaiGrup('audio', iceServers);
  await drainRealtime();
  await controllers[1].terima(iceServers);
  await drainRealtime();
  await controllers[2].terima(iceServers);
  await drainRealtime();

  await controllers[1].akhiri();
  await drainRealtime();

  assert.equal(controllers[1].state.status, 'idle');
  assert.deepEqual(controllers[2].state.participantIds, [ids[0], ids[2]]);
  assert.equal(peerConnections[2][1].closed, true);
  assert.equal(peerConnections[0][1].closed, undefined);

  await controllers[0].akhiri();
  await Promise.all(controllers.map((controller) => controller.dispose()));
});

test('group mesh calls connect each accepted participant to every other participant', async () => {
  const room = fakeRealtimeRoom();
  const ids = [
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  ];
  const controllers = [];
  const peerConnections = ids.map(() => []);
  for (let index = 0; index < ids.length; index += 1) {
    const peers = ids.filter((id) => id !== ids[index]);
    const controller = createGroupController({
      supabase: room.createSupabase(),
      id: ids[index],
      peerIds: peers,
      peerConnections: peerConnections[index],
    });
    controllers.push(controller);
    await controller.hubungkan();
  }

  const iceServers = [{ urls: ['turn:turn.example.test:3478'] }];
  await controllers[0].mulaiGrup('video', iceServers);
  await drainRealtime();
  assert.equal(controllers[1].state.status, 'incoming');
  assert.equal(controllers[2].state.status, 'incoming');

  await controllers[1].terima(iceServers);
  await drainRealtime();
  await controllers[2].terima(iceServers);
  await drainRealtime();

  const participants = controllers.map((controller) => controller.state.participantIds);
  const connectionCounts = peerConnections.map((peers) => peers.length);
  const offers = room.messages.filter((message) => message.type === 'offer');
  const answers = room.messages.filter((message) => message.type === 'answer');
  await controllers[0].akhiri();
  await drainRealtime();
  const endSignals = room.messages.filter((message) =>
    message.type === 'end' && message.senderId === ids[0]);
  await Promise.all(controllers.map((controller) => controller.dispose()));

  for (const controller of controllers) {
    assert.equal(controller.state.status, 'idle');
  }
  assert.deepEqual(participants, [ids, ids, ids], JSON.stringify(participants));
  assert.ok(connectionCounts.every((count) => count === 2), JSON.stringify(connectionCounts));
  assert.equal(offers.length, 3, JSON.stringify(offers));
  assert.equal(answers.length, 3, JSON.stringify(answers));
  assert.deepEqual(endSignals.map((message) => message.recipientId).sort(), ids.slice(1).sort());
  assert.ok(offers
    .every((message) => ids.includes(message.senderId) && ids.includes(message.recipientId)));
});

test('group mesh controller rejects groups larger than the tested participant cap', () => {
  assert.throws(() => buatPengendaliPanggilanGrup({
    supabase: fakeSupabase(),
    conversationId,
    userId,
    peerIds: Array.from({ length: MAKS_ANGGOTA_PANGGILAN_GRUP }, (_, index) =>
      `${String(index + 1).repeat(8)}-${String(index + 1).repeat(4)}-4aaa-8aaa-${String(index + 1).repeat(12)}`),
  }), /dibatasi 4 peserta/);
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

test('direct calls can mute the microphone and toggle the camera', async () => {
  const tracks = [
    { kind: 'audio', enabled: true, stop() {} },
    { kind: 'video', enabled: true, stop() {} },
  ];
  const controller = buatPengendaliPanggilan({
    supabase: fakeSupabase(),
    conversationId,
    userId,
    peerIds: [peerId],
    buatPeerConnection: () => mockPeerConnection(),
    buatId: () => callId,
    getUserMedia: async () => ({ getTracks: () => tracks }),
  });

  await controller.mulai('video', peerId, []);
  assert.equal(controller.state.audioEnabled, true);
  assert.equal(controller.state.videoEnabled, true);
  assert.equal(controller.toggleAudio(), false);
  assert.equal(controller.state.audioEnabled, false);
  assert.equal(tracks[0].enabled, false);
  assert.equal(controller.toggleVideo(), false);
  assert.equal(controller.state.videoEnabled, false);
  assert.equal(tracks[1].enabled, false);
  assert.equal(controller.toggleAudio(), true);
  assert.equal(controller.state.audioEnabled, true);

  await controller.akhiri();
  await controller.dispose();
});

test('direct video calls switch the active sender and replace the local camera track', async () => {
  const previousCamera = mediaTrack('video', 'user');
  const nextCamera = mediaTrack('video', 'environment');
  const localStream = mediaStream([mediaTrack('audio'), previousCamera]);
  const peer = mockPeerConnection();
  const constraints = [];
  let mediaRequest = 0;
  const controller = buatPengendaliPanggilan({
    supabase: fakeSupabase(),
    conversationId,
    userId,
    peerIds: [peerId],
    buatPeerConnection: () => peer,
    buatId: () => callId,
    getUserMedia: async (request) => {
      constraints.push(request);
      mediaRequest += 1;
      return mediaRequest === 1 ? localStream : mediaStream([nextCamera]);
    },
  });

  await controller.mulai('video', peerId, []);
  await controller.gantiKamera();
  assert.deepEqual(constraints[1], {
    audio: false,
    video: { facingMode: { ideal: 'environment' } },
  });
  assert.equal(peer.getSenders().find((sender) => sender.track.kind === 'video').track, nextCamera);
  assert.deepEqual(localStream.getVideoTracks(), [nextCamera]);
  assert.equal(previousCamera.stopped, true);
  assert.equal(controller.state.localStream, localStream);

  await controller.akhiri();
  await controller.dispose();
});

test('direct video calls prefer the next enumerated camera', async () => {
  const previousCamera = mediaTrack('video', 'user');
  previousCamera.settings.deviceId = 'camera-1';
  const nextCamera = mediaTrack('video', 'environment');
  const constraints = [];
  let mediaRequest = 0;
  const controller = buatPengendaliPanggilan({
    supabase: fakeSupabase(),
    conversationId,
    userId,
    peerIds: [peerId],
    buatPeerConnection: () => mockPeerConnection(),
    buatId: () => callId,
    enumerateDevices: async () => [
      { kind: 'videoinput', deviceId: 'camera-1' },
      { kind: 'videoinput', deviceId: 'camera-2' },
    ],
    getUserMedia: async (request) => {
      constraints.push(request);
      mediaRequest += 1;
      return mediaStream(mediaRequest === 1
        ? [mediaTrack('audio'), previousCamera]
        : [nextCamera]);
    },
  });

  await controller.mulai('video', peerId, []);
  await controller.gantiKamera();

  assert.deepEqual(constraints[1], {
    audio: false,
    video: { deviceId: { exact: 'camera-2' } },
  });
  assert.equal(controller.state.localStream.getVideoTracks()[0], nextCamera);

  await controller.akhiri();
  await controller.dispose();
});

test('failed camera replacement preserves the active track and stops the unused track', async () => {
  const previousCamera = mediaTrack('video', 'user');
  const nextCamera = mediaTrack('video', 'environment');
  const peer = mockPeerConnection();
  const addTrack = peer.addTrack.bind(peer);
  peer.addTrack = (track) => {
    const sender = addTrack(track);
    if (track.kind === 'video') {
      sender.replaceTrack = async () => { throw new Error('sender replacement failed'); };
    }
    return sender;
  };
  let mediaRequest = 0;
  const controller = buatPengendaliPanggilan({
    supabase: fakeSupabase(),
    conversationId,
    userId,
    peerIds: [peerId],
    buatPeerConnection: () => peer,
    buatId: () => callId,
    getUserMedia: async () => {
      mediaRequest += 1;
      return mediaStream(mediaRequest === 1
        ? [mediaTrack('audio'), previousCamera]
        : [nextCamera]);
    },
  });

  await controller.mulai('video', peerId, []);
  await assert.rejects(controller.gantiKamera(), /sender replacement failed/);

  assert.equal(controller.state.localStream.getVideoTracks()[0], previousCamera);
  assert.equal(previousCamera.stopped, false);
  assert.equal(nextCamera.stopped, true);

  await controller.akhiri();
  await controller.dispose();
});

test('declining a direct incoming call sends an end signal and releases state', async () => {
  const supabase = fakeSupabase();
  const controller = buatPengendaliPanggilan({
    supabase,
    conversationId,
    userId,
    peerIds: [peerId],
    buatPeerConnection: () => mockPeerConnection(),
  });
  await controller.hubungkan();
  supabase.receive({
    type: 'offer',
    callId,
    senderId: peerId,
    recipientId: userId,
    kind: 'audio',
    description: { type: 'offer', sdp: 'incoming-offer' },
  });

  assert.equal(controller.state.status, 'incoming');
  await controller.tolak();

  assert.equal(controller.state.status, 'idle');
  assert.equal(supabase.sent.at(-1).payload.type, 'reject');
  assert.equal(supabase.sent.at(-1).payload.recipientId, peerId);
  await controller.dispose();
});

test('direct rejected incoming calls report a rejected outcome to the caller', async () => {
  const room = fakeRealtimeRoom();
  const caller = buatPengendaliPanggilan({
    supabase: room.createSupabase(),
    conversationId,
    userId,
    peerIds: [peerId],
    buatPeerConnection: () => mockPeerConnection(),
    buatId: () => callId,
    getUserMedia: async () => mediaStream([mediaTrack('audio')]),
  });
  const recipient = buatPengendaliPanggilan({
    supabase: room.createSupabase(),
    conversationId,
    userId: peerId,
    peerIds: [userId],
    buatPeerConnection: () => mockPeerConnection(),
    getUserMedia: async () => mediaStream([mediaTrack('audio')]),
  });

  await caller.hubungkan();
  await recipient.hubungkan();
  await caller.mulai('audio', peerId, []);
  await drainRealtime();
  assert.equal(recipient.state.status, 'incoming');

  await recipient.tolak();
  await drainRealtime();

  assert.equal(recipient.state.status, 'idle');
  assert.equal(caller.state.status, 'idle');
  assert.equal(caller.state.outcome, 'rejected');

  await Promise.all([caller.dispose(), recipient.dispose()]);
});

test('group calls expose the same live microphone controls', async () => {
  const controller = createGroupController({
    supabase: fakeSupabase(),
    id: userId,
    peerIds: [peerId],
    peerConnections: [],
  });
  await controller.hubungkan();
  await controller.mulaiGrup('audio', []);

  assert.equal(controller.state.audioEnabled, true);
  assert.equal(controller.toggleAudio(), false);
  assert.equal(controller.state.audioEnabled, false);
  assert.equal(controller.toggleAudio(), true);
  assert.equal(controller.state.audioEnabled, true);

  await controller.akhiri();
  await controller.dispose();
});

test('group video camera switch replaces the track on every active mesh connection', async () => {
  const room = fakeRealtimeRoom();
  const thirdId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const oldCamera = mediaTrack('video', 'user');
  const newCamera = mediaTrack('video', 'environment');
  const hostPeers = [];
  const firstGuestPeers = [];
  const secondGuestPeers = [];
  let hostMediaRequest = 0;
  const host = createGroupController({
    supabase: room.createSupabase(),
    id: userId,
    peerIds: [peerId, thirdId],
    peerConnections: hostPeers,
    tracks: [mediaTrack('audio'), oldCamera],
    getUserMedia: async () => {
      hostMediaRequest += 1;
      return hostMediaRequest === 1
        ? mediaStream([mediaTrack('audio'), oldCamera])
        : mediaStream([newCamera]);
    },
  });
  const guest = createGroupController({
    supabase: room.createSupabase(),
    id: peerId,
    peerIds: [userId, thirdId],
    peerConnections: firstGuestPeers,
    tracks: [mediaTrack('audio'), mediaTrack('video', 'user')],
  });
  const secondGuest = createGroupController({
    supabase: room.createSupabase(),
    id: thirdId,
    peerIds: [userId, peerId],
    peerConnections: secondGuestPeers,
    tracks: [mediaTrack('audio'), mediaTrack('video', 'user')],
  });
  await host.hubungkan();
  await guest.hubungkan();
  await secondGuest.hubungkan();
  await host.mulaiGrup('video', []);
  await drainRealtime();
  await guest.terima([]);
  await drainRealtime();
  await secondGuest.terima([]);
  await drainRealtime();

  await host.gantiKamera();
  assert.equal(hostPeers.length, 2);
  for (const peer of hostPeers) {
    assert.equal(peer.getSenders().find((sender) => sender.track.kind === 'video').track, newCamera);
  }
  assert.deepEqual(host.state.localStream.getVideoTracks(), [newCamera]);
  assert.equal(oldCamera.stopped, true);

  await host.akhiri();
  await Promise.all([host.dispose(), guest.dispose(), secondGuest.dispose()]);
});

test('ending a local media track terminates the call and removes track listeners', async () => {
  const supabase = fakeSupabase();
  const peer = mockPeerConnection();
  let stopped = 0;
  const listeners = new Map();
  const track = {
    addEventListener(event, listener) { listeners.set(event, listener); },
    removeEventListener(event, listener) {
      if (listeners.get(event) === listener) listeners.delete(event);
    },
    stop() { stopped += 1; },
  };
  const controller = buatPengendaliPanggilan({
    supabase,
    conversationId,
    userId,
    peerIds: [peerId],
    buatPeerConnection: () => peer,
    buatId: () => callId,
    getUserMedia: async () => ({ getTracks: () => [track] }),
  });

  await controller.mulai('audio', peerId, []);
  listeners.get('ended')();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(controller.state.status, 'idle');
  assert.equal(supabase.sent.at(-1).payload.type, 'end');
  assert.equal(peer.closed, true);
  assert.equal(stopped, 1);
  assert.equal(listeners.size, 0);
  await controller.dispose();
});

test('hangup cancels an outgoing call while microphone or camera permission is pending', async () => {
  const supabase = fakeSupabase();
  const media = deferred();
  let stopped = 0;
  const controller = buatPengendaliPanggilan({
    supabase,
    conversationId,
    userId,
    peerIds: [peerId],
    getUserMedia: () => media.promise,
  });

  const starting = controller.mulai('audio', peerId, []);
  await controller.akhiri();
  media.resolve({ getTracks: () => [{ stop() { stopped += 1; } }] });
  await starting;

  assert.equal(stopped, 1);
  assert.equal(supabase.channelName, null);
  assert.deepEqual(supabase.sent, []);
  assert.equal(controller.state.status, 'idle');
});

test('disposing the call controller cancels a pending media permission request', async () => {
  const supabase = fakeSupabase();
  const media = deferred();
  let stopped = 0;
  const controller = buatPengendaliPanggilan({
    supabase,
    conversationId,
    userId,
    peerIds: [peerId],
    getUserMedia: () => media.promise,
  });

  const starting = controller.mulai('video', peerId, []);
  await controller.dispose();
  media.resolve({ getTracks: () => [{ stop() { stopped += 1; } }] });
  await starting;

  assert.equal(stopped, 1);
  assert.equal(supabase.channelName, null);
  assert.deepEqual(supabase.sent, []);
  assert.equal(controller.state.status, 'idle');
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

test('hangup cancels an incoming call while microphone or camera permission is pending', async () => {
  const supabase = fakeSupabase();
  const media = deferred();
  let stopped = 0;
  const controller = buatPengendaliPanggilan({
    supabase,
    conversationId,
    userId,
    peerIds: [peerId],
    getUserMedia: () => media.promise,
  });
  await controller.hubungkan();
  supabase.receive({
    type: 'offer',
    callId,
    senderId: peerId,
    recipientId: userId,
    kind: 'audio',
    description: { type: 'offer', sdp: 'remote-offer' },
  });

  const accepting = controller.terima([]);
  await controller.akhiri();
  media.resolve({ getTracks: () => [{ stop() { stopped += 1; } }] });
  await accepting;

  assert.equal(stopped, 1);
  assert.deepEqual(supabase.sent.map(({ payload }) => payload.type), ['end']);
  assert.equal(controller.state.status, 'idle');
  await controller.dispose();
});
