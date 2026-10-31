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
  let operationId = 0;

  function publish(next) {
    state = next;
    onChange(state);
  }

  function emitError(error) {
    if (disposed || !call) return;
    publish({ ...state, status: 'error', error });
  }

  async function connect() {
    if (disposed) throw new Error('Pengendali panggilan sudah ditutup.');
    if (connectionPromise) return connectionPromise;
    if (channel) return;
    const connectingChannel = supabase
      .channel(`chat-call:${conversationId}`, { config: { private: true } })
      .on('broadcast', { event: 'signal' }, (event) => {
        const payload = event?.payload && typeof event.payload === 'object'
          ? event.payload
          : event;
        void terimaSinyal(payload).catch(emitError);
      });
    channel = connectingChannel;

    connectionPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Koneksi signaling panggilan timeout.')), 15_000);
      connectingChannel.subscribe((status, error) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          clearTimeout(timeout);
          reject(error || new Error('Tidak dapat terhubung ke signaling panggilan.'));
        }
      });
    });
    try {
      await connectionPromise;
      if (disposed) throw new Error('Pengendali panggilan sudah ditutup.');
    } catch (error) {
      if (channel === connectingChannel) {
        channel = null;
        await supabase.removeChannel(connectingChannel);
      }
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
      if (candidate && call?.peer?.connection === connection) {
        void kirimSinyal('candidate', remoteId, { candidate: candidate.toJSON() })
          .catch(emitError);
      }
    };
    connection.ontrack = ({ streams }) => {
      if (call?.peer?.connection === connection) {
        publish({ ...state, status: 'connected', remoteStream: streams[0] });
      }
    };
    connection.onconnectionstatechange = () => {
      if (call?.peer?.connection !== connection) return;
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
      const currentOperationId = ++operationId;
      call = {
        id: payload.callId,
        peerId: payload.senderId,
        kind: payload.kind,
        direction: 'incoming',
        operationId: currentOperationId,
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
      const activeCall = call;
      const currentOperationId = activeCall.operationId;
      clearTimeout(ringTimeout);
      ringTimeout = null;
      await peer.connection.setRemoteDescription(payload.description);
      if (disposed || operationId !== currentOperationId || call !== activeCall) return;
      await pasangKandidatTertunda(peer);
      if (disposed || operationId !== currentOperationId || call !== activeCall) return;
      publish({ ...state, status: 'connecting' });
    } else if (payload.type === 'candidate' && candidateValid(payload.candidate)) {
      if (peer) await pasangKandidat(peer, payload.candidate);
      else if (call.pendingCandidates.length < MAX_PENDING_CANDIDATES) {
        call.pendingCandidates.push(payload.candidate);
      }
    } else if (payload.type === 'end') {
      clearTimeout(ringTimeout);
      ringTimeout = null;
      operationId += 1;
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
    if (disposed) throw new Error('Pengendali panggilan sudah ditutup.');
    if (!CALL_KINDS.has(kind) || !peers.has(peerId)) {
      throw new TypeError('Jenis panggilan atau kontak tidak valid.');
    }
    if (call) throw new Error('Panggilan lain sedang berlangsung.');
    const id = buatId();
    if (!id) throw new Error('Browser tidak menyediakan identitas panggilan yang aman.');

    const currentOperationId = ++operationId;
    const outgoingCall = {
      id,
      peerId,
      kind,
      direction: 'outgoing',
      operationId: currentOperationId,
    };
    call = outgoingCall;
    publish({ status: 'connecting', kind, peerId });
    try {
      const localStream = await getUserMedia({ audio: true, video: kind === 'video' });
      if (disposed || operationId !== currentOperationId || call !== outgoingCall) {
        localStream.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = localStream;
      await connect();
      if (disposed || operationId !== currentOperationId || call !== outgoingCall) return;
      const peer = buatKoneksi(peerId, iceServers);
      call.peer = peer;
      const description = await peer.connection.createOffer();
      if (disposed || operationId !== currentOperationId || call !== outgoingCall) return;
      await peer.connection.setLocalDescription(description);
      if (disposed || operationId !== currentOperationId || call !== outgoingCall) return;
      await kirimSinyal('offer', peerId, { kind, description: peer.connection.localDescription });
      if (disposed || operationId !== currentOperationId || call !== outgoingCall) return;
      publish({ status: 'ringing', callId: id, peerId, kind, localStream: stream });
      ringTimeout = setTimeout(() => {
        if (call?.id === id) void akhiri().catch(emitError);
      }, RING_TIMEOUT_MS);
    } catch (error) {
      if (disposed || operationId !== currentOperationId || call !== outgoingCall) return;
      bersihkanPanggilan();
      publish({ status: 'idle' });
      throw error;
    }
  }

  async function terima(iceServers) {
    if (disposed || !call || call.direction !== 'incoming' || !state.callId) {
      throw new Error('Tidak ada panggilan masuk untuk diterima.');
    }
    const incoming = call;
    const currentOperationId = incoming.operationId;
    clearTimeout(ringTimeout);
    ringTimeout = null;
    publish({ ...state, status: 'connecting' });
    try {
      const localStream = await getUserMedia({ audio: true, video: incoming.kind === 'video' });
      if (disposed || operationId !== currentOperationId || call !== incoming) {
        localStream.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = localStream;
      await connect();
      if (disposed || operationId !== currentOperationId || call !== incoming) return;
      const peer = buatKoneksi(incoming.peerId, iceServers);
      incoming.peer = peer;
      await peer.connection.setRemoteDescription(incoming.description);
      if (disposed || operationId !== currentOperationId || call !== incoming) return;
      for (const candidate of incoming.pendingCandidates.splice(0)) {
        await pasangKandidat(peer, candidate);
        if (disposed || operationId !== currentOperationId || call !== incoming) return;
      }
      await pasangKandidatTertunda(peer);
      if (disposed || operationId !== currentOperationId || call !== incoming) return;
      const answer = await peer.connection.createAnswer();
      if (disposed || operationId !== currentOperationId || call !== incoming) return;
      await peer.connection.setLocalDescription(answer);
      if (disposed || operationId !== currentOperationId || call !== incoming) return;
      await kirimSinyal('answer', incoming.peerId, {
        description: peer.connection.localDescription,
      });
      if (disposed || operationId !== currentOperationId || call !== incoming) return;
      publish({
        status: 'connecting',
        callId: incoming.id,
        peerId: incoming.peerId,
        kind: incoming.kind,
        localStream: stream,
      });
    } catch (error) {
      if (disposed || operationId !== currentOperationId || call !== incoming) return;
      bersihkanPanggilan();
      publish({ status: 'idle' });
      throw error;
    }
  }

  async function akhiri() {
    const active = call;
    operationId += 1;
    const endSignal = active && channel ? kirimSinyal('end', active.peerId) : null;
    bersihkanPanggilan();
    publish({ status: 'idle' });
    if (endSignal) await endSignal;
  }

  async function tolak() {
    if (!call || call.direction !== 'incoming') return;
    await akhiri();
  }

  async function dispose() {
    if (disposed) return;
    disposed = true;
    operationId += 1;
    const active = call;
    const activeChannel = channel;
    const endSignal = active && activeChannel ? kirimSinyal('end', active.peerId) : null;
    channel = null;
    bersihkanPanggilan();
    try {
      if (endSignal) await endSignal;
    } finally {
      try {
        if (activeChannel) await supabase.removeChannel(activeChannel);
      } finally {
        publish({ status: 'idle' });
      }
    }
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
