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

async function gantiTrackVideo({ stream, connections, getUserMedia, enumerateDevices, isCurrent }) {
  const oldTrack = stream?.getVideoTracks?.()[0] ||
    stream?.getTracks?.().find((track) => track.kind === 'video');
  if (!oldTrack) throw new Error('Track kamera lokal belum tersedia.');

  const devices = await enumerateDevices();
  const cameras = Array.isArray(devices)
    ? devices.filter((device) => device.kind === 'videoinput')
    : [];
  const currentDeviceId = oldTrack.getSettings?.().deviceId;
  const currentIndex = cameras.findIndex((device) => device.deviceId === currentDeviceId);
  const nextCamera = cameras.length > 1
    ? cameras[(currentIndex + 1 + cameras.length) % cameras.length]
    : null;
  const video = nextCamera
    ? { deviceId: { exact: nextCamera.deviceId } }
    : { facingMode: { ideal: oldTrack.getSettings?.().facingMode === 'environment' ? 'user' : 'environment' } };
  const replacementStream = await getUserMedia({ audio: false, video });
  const newTrack = replacementStream?.getTracks?.().find((track) => track.kind === 'video');
  if (!newTrack) {
    replacementStream?.getTracks?.().forEach((track) => track.stop());
    throw new Error('Browser tidak menyediakan track kamera baru.');
  }
  if (!isCurrent()) {
    newTrack.stop();
    throw new Error('Panggilan berakhir sebelum kamera dapat diganti.');
  }

  const senders = connections.flatMap((connection) =>
    connection?.getSenders?.().filter((sender) =>
      sender.track?.kind === 'video') || []);
  const replaced = [];
  try {
    for (const sender of senders) {
      await sender.replaceTrack(newTrack);
      replaced.push(sender);
      if (!isCurrent()) throw new Error('Panggilan berakhir sebelum kamera dapat diganti.');
    }
  } catch (error) {
    await Promise.allSettled(replaced.map((sender) => sender.replaceTrack(oldTrack)));
    newTrack.stop();
    throw error;
  }

  stream.removeTrack(oldTrack);
  stream.addTrack(newTrack);
  oldTrack.stop();
  replacementStream.getTracks()
    .filter((track) => track !== newTrack)
    .forEach((track) => track.stop());
  return newTrack;
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
  enumerateDevices = () => globalThis.navigator?.mediaDevices?.enumerateDevices?.() || [],
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
  let trackListeners = [];
  let call = null;
  let state = { status: 'idle' };
  let disposed = false;
  let ringTimeout = null;
  let operationId = 0;

  function publish(next) {
    state = next;
    onChange(state);
  }

  function localTrackState() {
    const tracks = stream?.getTracks?.() || [];
    return {
      audioEnabled: tracks.some((track) => track.kind === 'audio' && track.enabled),
      videoEnabled: tracks.some((track) => track.kind === 'video' && track.enabled),
    };
  }

  function toggleLocalTrack(kind) {
    if (!call || !stream) throw new Error('Media lokal belum tersedia.');
    const tracks = stream.getTracks().filter((track) => track.kind === kind);
    if (tracks.length === 0) throw new Error(`Track ${kind} tidak tersedia pada panggilan ini.`);
    const enabled = tracks.some((track) => track.enabled);
    tracks.forEach((track) => { track.enabled = !enabled; });
    publish({ ...state, ...localTrackState() });
    return !enabled;
  }

  async function gantiKamera() {
    if (disposed || !call || call.kind !== 'video' || !stream) {
      throw new Error('Tidak ada panggilan video aktif untuk mengganti kamera.');
    }
    const activeCall = call;
    const currentOperationId = operationId;
    await gantiTrackVideo({
      stream,
      connections: [activeCall.peer?.connection],
      getUserMedia,
      enumerateDevices,
      isCurrent: () => !disposed && operationId === currentOperationId && call === activeCall,
    });
    pantauTrackLokal(stream, activeCall);
    publish({ ...state, localStream: stream, ...localTrackState() });
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
        call.connectedAt ||= Date.now();
        publish({ ...state, status: 'connected', connectedAt: call.connectedAt, remoteStream: streams[0] });
      }
    };
    connection.onconnectionstatechange = () => {
      if (call?.peer?.connection !== connection) return;
      if (connection.connectionState === 'connected') {
        call.connectedAt ||= Date.now();
        publish({ ...state, status: 'connected', connectedAt: call.connectedAt });
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
    } else if (payload.type === 'reject' && call.direction === 'outgoing') {
      const rejectedCall = call;
      clearTimeout(ringTimeout);
      ringTimeout = null;
      operationId += 1;
      bersihkanPanggilan();
      publish({ status: 'idle', callId: rejectedCall.id, outcome: 'rejected' });
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
    for (const { track, listener } of trackListeners) {
      track.removeEventListener?.('ended', listener);
    }
    trackListeners = [];
    call?.peer?.connection.close();
    call = null;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
  }

  function pantauTrackLokal(localStream, activeCall) {
    trackListeners = localStream.getTracks().map((track) => {
      const listener = () => {
        if (call === activeCall) {
          void akhiri().catch(emitError);
        }
      };
      track.addEventListener?.('ended', listener, { once: true });
      return { track, listener };
    });
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
      pantauTrackLokal(localStream, outgoingCall);
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
      publish({
        status: 'ringing',
        callId: id,
        peerId,
        kind,
        localStream: stream,
        ...localTrackState(),
      });
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
      pantauTrackLokal(localStream, incoming);
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
        ...localTrackState(),
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
    const incoming = call;
    operationId += 1;
    const rejectSignal = channel ? kirimSinyal('reject', incoming.peerId) : null;
    bersihkanPanggilan();
    publish({ status: 'idle' });
    if (rejectSignal) await rejectSignal;
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
    toggleAudio: () => toggleLocalTrack('audio'),
    toggleVideo: () => toggleLocalTrack('video'),
    gantiKamera,
    hubungkan: connect,
    terima,
    tolak,
    akhiri,
    dispose,
    get state() { return state; },
  };
}

export const MAKS_ANGGOTA_PANGGILAN_GRUP = 4;
const MASA_BERLAKU_UNDANGAN_MS = 2 * 60_000;

export function buatPengendaliPanggilanGrup({
  supabase,
  conversationId,
  userId,
  peerIds,
  onChange = () => {},
  getUserMedia = (...args) => navigator.mediaDevices.getUserMedia(...args),
  enumerateDevices = () => globalThis.navigator?.mediaDevices?.enumerateDevices?.() || [],
  buatPeerConnection = (configuration) => new RTCPeerConnection(configuration),
  buatId = () => globalThis.crypto?.randomUUID?.(),
}) {
  if (!UUID.test(conversationId || '') || !UUID.test(userId || '')) {
    throw new TypeError('Identitas percakapan atau pengguna tidak valid.');
  }
  const peers = new Set((peerIds || []).filter((id) => UUID.test(id) && id !== userId));
  if (peers.size + 1 > MAKS_ANGGOTA_PANGGILAN_GRUP) {
    throw new RangeError(`Panggilan grup mesh dibatasi ${MAKS_ANGGOTA_PANGGILAN_GRUP} peserta.`);
  }

  let channel = null;
  let connectionPromise = null;
  let call = null;
  let stream = null;
  let ringTimeout = null;
  let trackListeners = [];
  let operationId = 0;
  let disposed = false;
  let state = { status: 'idle' };

  function publish(next) {
    state = next;
    onChange(state);
  }

  function publishCall() {
    if (!call) {
      publish({ status: 'idle' });
      return;
    }
    const remoteStreams = [...call.peerConnections.entries()]
      .filter(([, peer]) => peer.remoteStream)
      .map(([peerId, peer]) => ({ peerId, stream: peer.remoteStream }));
    publish({
      status: call.status,
      callId: call.id,
      peerId: call.hostId,
      kind: call.kind,
      localStream: stream,
      ...localTrackState(),
      remoteStreams,
      remoteStream: remoteStreams[0]?.stream,
      participantIds: [...call.members].sort(),
      invitedPeerIds: [...call.invitedPeers].filter((id) => !call.members.has(id)).sort(),
      connectedAt: call.connectedAt || null,
      group: true,
    });
  }

  function localTrackState() {
    const tracks = stream?.getTracks?.() || [];
    return {
      audioEnabled: tracks.some((track) => track.kind === 'audio' && track.enabled),
      videoEnabled: tracks.some((track) => track.kind === 'video' && track.enabled),
    };
  }

  function toggleLocalTrack(kind) {
    if (!call || !stream) throw new Error('Media lokal belum tersedia.');
    const tracks = stream.getTracks().filter((track) => track.kind === kind);
    if (tracks.length === 0) throw new Error(`Track ${kind} tidak tersedia pada panggilan ini.`);
    const enabled = tracks.some((track) => track.enabled);
    tracks.forEach((track) => { track.enabled = !enabled; });
    publishCall();
    return !enabled;
  }

  async function gantiKamera() {
    if (disposed || !call || call.kind !== 'video' || !stream) {
      throw new Error('Tidak ada panggilan video aktif untuk mengganti kamera.');
    }
    const activeCall = call;
    const currentOperationId = operationId;
    await gantiTrackVideo({
      stream,
      connections: [...activeCall.peerConnections.values()]
        .map((peer) => peer.connection),
      getUserMedia,
      enumerateDevices,
      isCurrent: () => !disposed && operationId === currentOperationId && call === activeCall,
    });
    pantauTrackLokal(stream, activeCall);
    publishCall();
  }

  function emitError(error) {
    if (disposed || !call) return;
    call.status = 'error';
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

  async function kirimSinyalUntuk(activeCall, type, recipientId, values = {}) {
    if (!channel || !recipientId) throw new Error('Kanal panggilan belum siap.');
    const status = await channel.send({
      type: 'broadcast',
      event: 'signal',
      payload: {
        type,
        callId: activeCall.id,
        senderId: userId,
        recipientId,
        ...values,
      },
    });
    if (status !== 'ok') throw new Error('Sinyal panggilan gagal dikirim.');
  }

  function validRoster(ids, senderId) {
    return Array.isArray(ids) &&
      ids.length >= 2 &&
      ids.length <= MAKS_ANGGOTA_PANGGILAN_GRUP &&
      ids.includes(userId) &&
      ids.includes(senderId) &&
      new Set(ids).size === ids.length &&
      ids.every((id) => UUID.test(id) && (id === userId || peers.has(id)));
  }

  async function pasangKandidat(peer, candidate) {
    if (!candidateValid(candidate)) return;
    if (!peer.connection.remoteDescription) {
      if (peer.pendingCandidates.length < MAX_PENDING_CANDIDATES) {
        peer.pendingCandidates.push(candidate);
      }
      return;
    }
    await peer.connection.addIceCandidate(candidate);
  }

  async function pasangKandidatTertunda(peer) {
    for (const candidate of peer.pendingCandidates.splice(0)) {
      await peer.connection.addIceCandidate(candidate);
    }
  }

  async function tawarkan(peerId, peer) {
    const activeCall = call;
    const currentOperationId = operationId;
    const offer = await peer.connection.createOffer();
    if (disposed || operationId !== currentOperationId || call !== activeCall) return;
    await peer.connection.setLocalDescription(offer);
    if (disposed || operationId !== currentOperationId || call !== activeCall) return;
    await kirimSinyalUntuk(activeCall, 'offer', peerId, {
      description: peer.connection.localDescription,
    });
  }

  function buatKoneksi(peerId, iceServers) {
    const activeCall = call;
    const connection = buatPeerConnection({ iceServers });
    for (const track of stream.getTracks()) connection.addTrack(track, stream);
    const peer = { connection, pendingCandidates: [], remoteStream: null };
    activeCall.peerConnections.set(peerId, peer);
    connection.onicecandidate = ({ candidate }) => {
      if (candidate && call === activeCall && activeCall.peerConnections.get(peerId) === peer) {
        void kirimSinyalUntuk(activeCall, 'candidate', peerId, { candidate: candidate.toJSON() })
          .catch(emitError);
      }
    };
    connection.ontrack = ({ streams }) => {
      if (call !== activeCall || activeCall.peerConnections.get(peerId) !== peer) return;
      peer.remoteStream = streams?.[0] || null;
      activeCall.status = 'connected';
      activeCall.connectedAt ||= Date.now();
      publishCall();
    };
    connection.onconnectionstatechange = () => {
      if (call !== activeCall || activeCall.peerConnections.get(peerId) !== peer) return;
      if (connection.connectionState === 'connected') {
        activeCall.status = 'connected';
        activeCall.connectedAt ||= Date.now();
        publishCall();
      } else if (connection.connectionState === 'failed') {
        emitError(new Error(`Koneksi dengan peserta ${peerId} gagal. Periksa jaringan atau konfigurasi TURN.`));
      }
    };
    return peer;
  }

  async function pastikanKoneksi(peerId, offerIfInitiator = true) {
    if (!call || !call.members.has(peerId) || peerId === userId) return null;
    let peer = call.peerConnections.get(peerId);
    if (!peer) {
      peer = buatKoneksi(peerId, call.iceServers);
      if (offerIfInitiator && userId < peerId) {
        await tawarkan(peerId, peer);
      }
    }
    return peer;
  }

  function bersihkanPanggilan() {
    clearTimeout(ringTimeout);
    ringTimeout = null;
    for (const { track, listener } of trackListeners) {
      track.removeEventListener?.('ended', listener);
    }
    trackListeners = [];
    call?.peerConnections.forEach(({ connection }) => connection.close());
    call = null;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
  }

  function pantauTrackLokal(localStream, activeCall) {
    trackListeners = localStream.getTracks().map((track) => {
      const listener = () => {
        if (call === activeCall) void akhiri().catch(emitError);
      };
      track.addEventListener?.('ended', listener, { once: true });
      return { track, listener };
    });
  }

  async function terimaSinyal(payload) {
    if (disposed || !payload || payload.recipientId !== userId ||
        !peers.has(payload.senderId) || !UUID.test(payload.callId || '')) return;

    if (payload.type === 'invite') {
      if (call || !CALL_KINDS.has(payload.kind) ||
          !validRoster(payload.participantIds, payload.senderId) ||
          !Number.isFinite(payload.expiresAt) || payload.expiresAt <= Date.now()) return;
      call = {
        id: payload.callId,
        kind: payload.kind,
        hostId: payload.senderId,
        direction: 'incoming',
        status: 'incoming',
        members: new Set([payload.senderId]),
        invitedPeers: new Set(payload.participantIds.filter((id) => id !== userId)),
        peerConnections: new Map(),
        pendingCandidates: new Map(),
        invitedPeers: new Set(payload.participantIds.filter((id) => id !== userId)),
        expiresAt: payload.expiresAt,
        iceServers: [],
      };
      publishCall();
      ringTimeout = setTimeout(() => {
        if (call?.id === payload.callId) void tolak().catch(emitError);
      }, Math.min(RING_TIMEOUT_MS, Math.max(0, payload.expiresAt - Date.now())));
      return;
    }
    if (!call || call.id !== payload.callId) return;

    if (payload.type === 'join' && call.hostId === userId &&
        call.direction === 'outgoing' && peers.has(payload.senderId) &&
        call.invitedPeers.has(payload.senderId) && !call.members.has(payload.senderId)) {
      call.members.add(payload.senderId);
      call.invitedPeers.delete(payload.senderId);
      call.status = 'connecting';
      await kirimSinyalUntuk(call, 'roster', payload.senderId, {
        participantIds: [...call.members],
      });
      for (const memberId of call.members) {
        if (memberId !== userId && memberId !== payload.senderId) {
          await kirimSinyalUntuk(call, 'peer-joined', memberId, {
            participantId: payload.senderId,
          });
        }
      }
      await pastikanKoneksi(payload.senderId);
      publishCall();
      return;
    }

    if (payload.type === 'roster' && payload.senderId === call.hostId &&
        validRoster(payload.participantIds, payload.senderId)) {
      call.members = new Set(payload.participantIds);
      call.invitedPeers = new Set([...call.invitedPeers]
        .filter((id) => !call.members.has(id)));
      call.status = 'connecting';
      for (const memberId of call.members) {
        if (memberId !== userId) await pastikanKoneksi(memberId);
      }
      publishCall();
      return;
    }

    if (payload.type === 'peer-joined' && payload.senderId === call.hostId &&
        peers.has(payload.participantId)) {
      call.members.add(payload.participantId);
      call.invitedPeers.delete(payload.participantId);
      await pastikanKoneksi(payload.participantId);
      publishCall();
      return;
    }

    if (payload.type === 'end' && payload.senderId === call.hostId) {
      operationId += 1;
      bersihkanPanggilan();
      publish({ status: 'idle' });
      return;
    }

    if (payload.type === 'reject' && call.hostId === userId &&
        call.invitedPeers.has(payload.senderId) && !call.members.has(payload.senderId)) {
      call.invitedPeers.delete(payload.senderId);
      if (call.invitedPeers.size === 0 && call.members.size === 1) {
        const rejectedCall = call;
        operationId += 1;
        bersihkanPanggilan();
        publish({
          status: 'idle',
          callId: rejectedCall.id,
          outcome: 'rejected',
          group: true,
        });
        return;
      }
      publishCall();
      return;
    }

    if (payload.type === 'peer-left' && payload.senderId === call.hostId &&
        peers.has(payload.participantId)) {
      call.members.delete(payload.participantId);
      const departed = call.peerConnections.get(payload.participantId);
      departed?.connection.close();
      call.peerConnections.delete(payload.participantId);
      publishCall();
      return;
    }

    if (!call.members.has(payload.senderId)) return;
    if (payload.type === 'leave') {
      call.members.delete(payload.senderId);
      const departed = call.peerConnections.get(payload.senderId);
      departed?.connection.close();
      call.peerConnections.delete(payload.senderId);
      if (call.hostId === userId) {
        for (const memberId of call.members) {
          if (memberId !== userId) {
            await kirimSinyalUntuk(call, 'peer-left', memberId, {
              participantId: payload.senderId,
            });
          }
        }
      }
      publishCall();
      return;
    }
    const peer = await pastikanKoneksi(payload.senderId, false);

    if (payload.type === 'offer' && descriptionValid(payload.description, 'offer')) {
      const activeCall = call;
      const currentOperationId = operationId;
      await peer.connection.setRemoteDescription(payload.description);
      if (disposed || operationId !== currentOperationId || call !== activeCall) return;
      await pasangKandidatTertunda(peer);
      const answer = await peer.connection.createAnswer();
      if (disposed || operationId !== currentOperationId || call !== activeCall) return;
      await peer.connection.setLocalDescription(answer);
      if (disposed || operationId !== currentOperationId || call !== activeCall) return;
      await kirimSinyalUntuk(activeCall, 'answer', payload.senderId, {
        description: peer.connection.localDescription,
      });
    } else if (payload.type === 'answer' && descriptionValid(payload.description, 'answer') && peer) {
      await peer.connection.setRemoteDescription(payload.description);
      await pasangKandidatTertunda(peer);
    } else if (payload.type === 'candidate' && peer) {
      await pasangKandidat(peer, payload.candidate);
    }
  }

  async function mulaiGrup(kind, iceServers) {
    if (disposed) throw new Error('Pengendali panggilan sudah ditutup.');
    if (!CALL_KINDS.has(kind) || peers.size < 1) {
      throw new TypeError('Jenis panggilan atau peserta grup tidak valid.');
    }
    if (call) throw new Error('Panggilan lain sedang berlangsung.');
    const id = buatId();
    if (!id) throw new Error('Browser tidak menyediakan identitas panggilan yang aman.');
    const activeCall = {
      id,
      kind,
      hostId: userId,
      direction: 'outgoing',
      status: 'connecting',
      members: new Set([userId]),
      invitedPeers: new Set(peers),
      peerConnections: new Map(),
      pendingCandidates: new Map(),
      expiresAt: Date.now() + MASA_BERLAKU_UNDANGAN_MS,
      iceServers,
    };
    call = activeCall;
    const currentOperationId = ++operationId;
    publishCall();
    try {
      const localStream = await getUserMedia({ audio: true, video: kind === 'video' });
      if (disposed || operationId !== currentOperationId || call !== activeCall) {
        localStream.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = localStream;
      pantauTrackLokal(localStream, activeCall);
      await connect();
      if (disposed || operationId !== currentOperationId || call !== activeCall) return;
      for (const peerId of peers) {
        await kirimSinyalUntuk(activeCall, 'invite', peerId, {
          kind,
          participantIds: [userId, ...peers],
          expiresAt: activeCall.expiresAt,
        });
      }
      activeCall.status = 'ringing';
      publishCall();
      ringTimeout = setTimeout(() => {
        if (call === activeCall && activeCall.members.size === 1) {
          void akhiri().catch(emitError);
        } else if (call === activeCall && activeCall.hostId === userId) {
          const pendingInvites = [...activeCall.invitedPeers];
          activeCall.invitedPeers.clear();
          for (const peerId of pendingInvites) {
            void kirimSinyalUntuk(activeCall, 'end', peerId).catch(emitError);
          }
          publishCall();
        }
      }, RING_TIMEOUT_MS);
    } catch (error) {
      if (disposed || operationId !== currentOperationId || call !== activeCall) return;
      for (const peerId of activeCall.invitedPeers) {
        void kirimSinyalUntuk(activeCall, 'end', peerId).catch(() => {});
      }
      bersihkanPanggilan();
      publish({ status: 'idle' });
      throw error;
    }
  }

  async function terima(iceServers) {
    if (disposed || !call || call.status !== 'incoming') {
      throw new Error('Tidak ada panggilan grup masuk untuk diterima.');
    }
    const incoming = call;
    clearTimeout(ringTimeout);
    ringTimeout = null;
    incoming.iceServers = iceServers;
    incoming.members = new Set([userId]);
    incoming.status = 'connecting';
    const currentOperationId = ++operationId;
    publishCall();
    try {
      const localStream = await getUserMedia({ audio: true, video: incoming.kind === 'video' });
      if (disposed || operationId !== currentOperationId || call !== incoming) {
        localStream.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = localStream;
      pantauTrackLokal(localStream, incoming);
      await connect();
      if (disposed || operationId !== currentOperationId || call !== incoming) return;
      await kirimSinyalUntuk(incoming, 'join', incoming.hostId);
      incoming.members.add(incoming.hostId);
      incoming.status = 'connecting';
      publishCall();
    } catch (error) {
      if (disposed || operationId !== currentOperationId || call !== incoming) return;
      bersihkanPanggilan();
      publish({ status: 'idle' });
      throw error;
    }
  }

  async function akhiri() {
    const activeCall = call;
    if (!activeCall) return;
    operationId += 1;
    const recipients = activeCall.hostId === userId
      ? new Set([...activeCall.members, ...activeCall.invitedPeers])
      : new Set([activeCall.hostId]);
    const signalType = activeCall.hostId === userId ? 'end' : 'leave';
    const sends = channel
      ? [...recipients].filter((id) => id !== userId)
        .map((id) => kirimSinyalUntuk(activeCall, signalType, id))
      : [];
    bersihkanPanggilan();
    publish({ status: 'idle' });
    await Promise.all(sends);
  }

  async function tolak() {
    if (!call || call.status !== 'incoming') return;
    const activeCall = call;
    if (channel) await kirimSinyalUntuk(activeCall, 'reject', activeCall.hostId);
    operationId += 1;
    bersihkanPanggilan();
    publish({ status: 'idle' });
  }

  async function dispose() {
    if (disposed) return;
    disposed = true;
    operationId += 1;
    const activeCall = call;
    const activeChannel = channel;
    const recipients = activeCall
      ? (activeCall.hostId === userId
        ? new Set([...activeCall.members, ...activeCall.invitedPeers])
        : new Set([activeCall.hostId]))
      : [];
    const signalType = activeCall?.hostId === userId ? 'end' : 'leave';
    const sends = activeCall && activeChannel
      ? [...recipients].filter((id) => id !== userId)
        .map((id) => kirimSinyalUntuk(activeCall, signalType, id))
      : [];
    channel = null;
    bersihkanPanggilan();
    try {
      await Promise.all(sends);
    } finally {
      try {
        if (activeChannel) await supabase.removeChannel(activeChannel);
      } finally {
        publish({ status: 'idle' });
      }
    }
  }

  return {
    mulaiGrup,
    toggleAudio: () => toggleLocalTrack('audio'),
    toggleVideo: () => toggleLocalTrack('video'),
    gantiKamera,
    hubungkan: connect,
    terima,
    tolak,
    akhiri,
    dispose,
    get state() { return state; },
  };
}
