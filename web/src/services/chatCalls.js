const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CALL_KINDS = new Set(['audio', 'video']);
const RING_TIMEOUT_MS = 45_000;
const MAX_PENDING_CANDIDATES = 128;

function descriptionValid(description, expectedType) {
  return description?.type === expectedType &&
    typeof description.sdp === 'string' &&
    description.sdp.length > 0 &&
    description.sdp.length <= 64_000;
}

function candidateValid(candidate) {
  return candidate &&
    typeof candidate.candidate === 'string' &&
    candidate.candidate.length > 0 &&
    candidate.candidate.length <= 4_096;
}

export async function ambilIceServers(supabase, conversationId) {
  const { data, error } = await supabase.functions.invoke('chat-turn-credentials', {
    body: { conversationId },
  });
  if (error) throw error;
  if (!Array.isArray(data?.iceServers) || data.iceServers.length === 0) {
    throw new Error('Server panggilan belum menyediakan konfigurasi TURN.');
  }
  return data.iceServers;
}

export function buatPengendaliPanggilan({
  supabase,
  conversationId,
  userId,
  peerIds,
  onChange = () => {},
  getUserMedia = (...args) => navigator.mediaDevices.getUserMedia(...args),
  buatPeerConnection = (configuration) => new RTCPeerConnection(configuration),
  buatId = () => globalThis.crypto?.randomUUID?.(),
}) {
  if (!UUID.test(conversationId || '') || !UUID.test(userId || '')) {
    throw new TypeError('Identitas percakapan atau pengguna tidak valid.');
  }

  const peers = new Set((peerIds || []).filter((id) => UUID.test(id) && id !== userId));
  let channel = null;
  let connectionPromise = null;
  let stream = null;
  let call = null;
  let state = { status: 'idle' };
  let disposed = false;
  let ringTimeout = null;

  function publish(next) {
    state = next;
    onChange(state);
  }

  function emitError(error) {
    publish({ ...state, status: 'error', error });
  }

  async function connect() {
    if (connectionPromise) return connectionPromise;
    if (channel) return;
    channel = supabase
      .channel(`chat-call:${conversationId}`, { config: { private: true } })
      .on('broadcast', { event: 'signal' }, (event) => {
        const payload = event?.payload && typeof event.payload === 'object'
          ? event.payload
          : event;
        void terimaSinyal(payload).catch(emitError);
      });

    connectionPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Koneksi signaling panggilan timeout.')), 15_000);
      channel.subscribe((status, error) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timeout);
          reject(error || new Error('Tidak dapat terhubung ke signaling panggilan.'));
        }
      });
    });
    try {
      await connectionPromise;
    } catch (error) {
      await supabase.removeChannel(channel);
      channel = null;
      throw error;
    } finally {
      connectionPromise = null;
    }
  }

  async function kirimSinyal(type, recipientId, values = {}) {
    if (!channel || !recipientId) throw new Error('Kanal panggilan belum siap.');
    const status = await channel.send({
      type: 'broadcast',
      event: 'signal',
      payload: {
        type,
        callId: call?.id,
        senderId: userId,
        recipientId,
        ...values,
      },
    });
    if (status !== 'ok') throw new Error('Sinyal panggilan gagal dikirim.');
  }

  function buatKoneksi(remoteId, iceServers) {
    const connection = buatPeerConnection({ iceServers });
    for (const track of stream.getTracks()) connection.addTrack(track, stream);
    connection.onicecandidate = ({ candidate }) => {
      if (candidate && call) {
        void kirimSinyal('candidate', remoteId, { candidate: candidate.toJSON() })
          .catch(emitError);
      }
    };
    connection.ontrack = ({ streams }) => {
      if (call) publish({ ...state, status: 'connected', remoteStream: streams[0] });
    };
    connection.onconnectionstatechange = () => {
      if (!call) return;
      if (connection.connectionState === 'connected') {
        publish({ ...state, status: 'connected' });
      } else if (connection.connectionState === 'failed') {
        emitError(new Error('Koneksi gagal. Periksa jaringan atau konfigurasi TURN.'));
      }
    };
    return { connection, pendingCandidates: [] };
  }

  async function pasangKandidat(peer, candidate) {
    if (!candidateValid(candidate)) return;
    if (!peer.connection.remoteDescription) {
      if (peer.pendingCandidates.length >= MAX_PENDING_CANDIDATES) return;
      peer.pendingCandidates.push(candidate);
      return;
    }
    await peer.connection.addIceCandidate(candidate);
  }

  async function pasangKandidatTertunda(peer) {
    for (const candidate of peer.pendingCandidates.splice(0)) {
      await peer.connection.addIceCandidate(candidate);
    }
  }

  async function terimaSinyal(payload) {
    if (disposed || !payload || payload.recipientId !== userId ||
        !peers.has(payload.senderId) || !UUID.test(payload.callId || '')) return;

    if (payload.type === 'offer') {
      if (call || !CALL_KINDS.has(payload.kind) ||
          !descriptionValid(payload.description, 'offer')) return;
      call = {
        id: payload.callId,
        peerId: payload.senderId,
        kind: payload.kind,
        direction: 'incoming',
        description: payload.description,
        pendingCandidates: [],
      };
      publish({
        status: 'incoming',
        callId: call.id,
        peerId: call.peerId,
        kind: call.kind,
        description: call.description,
      });
      ringTimeout = setTimeout(() => {
        if (call?.id === payload.callId) void akhiri().catch(emitError);
      }, RING_TIMEOUT_MS);
      return;
    }
    if (!call || call.id !== payload.callId || call.peerId !== payload.senderId) return;

    const peer = call.peer;
    if (payload.type === 'answer' && peer &&
        descriptionValid(payload.description, 'answer') && call.direction === 'outgoing') {
      clearTimeout(ringTimeout);
      ringTimeout = null;
      await peer.connection.setRemoteDescription(payload.description);
      await pasangKandidatTertunda(peer);
      publish({ ...state, status: 'connecting' });
    } else if (payload.type === 'candidate' && candidateValid(payload.candidate)) {
      if (peer) await pasangKandidat(peer, payload.candidate);
      else if (call.pendingCandidates.length < MAX_PENDING_CANDIDATES) {
        call.pendingCandidates.push(payload.candidate);
      }
    } else if (payload.type === 'end') {
      clearTimeout(ringTimeout);
      ringTimeout = null;
      bersihkanPanggilan();
      publish({ status: 'idle' });
    }
  }

  function bersihkanPanggilan() {
    clearTimeout(ringTimeout);
    ringTimeout = null;
    call?.peer?.connection.close();
    call = null;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
  }

  async function mulai(kind, peerId, iceServers) {
    if (!CALL_KINDS.has(kind) || !peers.has(peerId)) {
      throw new TypeError('Jenis panggilan atau kontak tidak valid.');
    }
    if (call) throw new Error('Panggilan lain sedang berlangsung.');
    const id = buatId();
    if (!id) throw new Error('Browser tidak menyediakan identitas panggilan yang aman.');
    publish({ status: 'connecting', kind, peerId });
    try {
      stream = await getUserMedia({ audio: true, video: kind === 'video' });
      await connect();
      call = { id, peerId, kind, direction: 'outgoing' };
      const peer = buatKoneksi(peerId, iceServers);
      call.peer = peer;
      const description = await peer.connection.createOffer();
      await peer.connection.setLocalDescription(description);
      await kirimSinyal('offer', peerId, { kind, description: peer.connection.localDescription });
      publish({ status: 'ringing', callId: id, peerId, kind, localStream: stream });
      ringTimeout = setTimeout(() => {
        if (call?.id === id) void akhiri().catch(emitError);
      }, RING_TIMEOUT_MS);
    } catch (error) {
      bersihkanPanggilan();
      publish({ status: 'idle' });
      throw error;
    }
  }

  async function terima(iceServers) {
    if (!call || call.direction !== 'incoming' || !state.callId) {
      throw new Error('Tidak ada panggilan masuk untuk diterima.');
    }
    const incoming = call;
    clearTimeout(ringTimeout);
    ringTimeout = null;
    publish({ ...state, status: 'connecting' });
    try {
      stream = await getUserMedia({ audio: true, video: incoming.kind === 'video' });
      await connect();
      const peer = buatKoneksi(incoming.peerId, iceServers);
      incoming.peer = peer;
      await peer.connection.setRemoteDescription(incoming.description);
      for (const candidate of incoming.pendingCandidates.splice(0)) {
        await pasangKandidat(peer, candidate);
      }
      await pasangKandidatTertunda(peer);
      const answer = await peer.connection.createAnswer();
      await peer.connection.setLocalDescription(answer);
      await kirimSinyal('answer', incoming.peerId, {
        description: peer.connection.localDescription,
      });
      publish({
        status: 'connecting',
        callId: incoming.id,
        peerId: incoming.peerId,
        kind: incoming.kind,
        localStream: stream,
      });
    } catch (error) {
      bersihkanPanggilan();
      publish({ status: 'idle' });
      throw error;
    }
  }

  async function akhiri() {
    const active = call;
    if (active && channel) {
      try {
        await kirimSinyal('end', active.peerId);
      } finally {
        bersihkanPanggilan();
        publish({ status: 'idle' });
      }
      return;
    }
    bersihkanPanggilan();
    publish({ status: 'idle' });
  }

  async function tolak() {
    if (!call || call.direction !== 'incoming') return;
    await akhiri();
  }

  async function dispose() {
    disposed = true;
    try {
      if (call && channel) await kirimSinyal('end', call.peerId);
    } finally {
      bersihkanPanggilan();
      if (channel) await supabase.removeChannel(channel);
      channel = null;
    }
    publish({ status: 'idle' });
  }

  return {
    mulai,
    hubungkan: connect,
    terima,
    tolak,
    akhiri,
    dispose,
    get state() { return state; },
  };
}
