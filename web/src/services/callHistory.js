export const CALL_HISTORY_RETENTION_DAYS = 90;
export const MAX_CALL_HISTORY_ITEMS = 100;
export const MAX_CALL_HISTORY_PARTICIPANTS = 4;
export const CALL_RING_TIMEOUT_MS = 45_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MEDIA_KINDS = new Set(['audio', 'video']);
const TERMINAL_OUTCOMES = new Set(['completed', 'missed', 'rejected', 'cancelled', 'failed']);

export async function muatRiwayatPanggilan(client, userId, now = Date.now()) {
  if (!UUID.test(userId || '') || !Number.isFinite(now)) {
    throw new TypeError('Identitas pengguna atau waktu riwayat panggilan tidak valid.');
  }

  const batas = new Date(now - CALL_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from('chat_call_history')
    .select('id,conversation_id,started_by,participant_ids,media_kind,outcome,started_at,ended_at')
    .contains('participant_ids', [userId])
    .gte('started_at', batas)
    .order('started_at', { ascending: false })
    .limit(MAX_CALL_HISTORY_ITEMS);
  if (error) throw error;
  const calls = data || [];
  const timedOutCalls = calls.filter((call) =>
    call.outcome === 'ringing' &&
    now - Date.parse(call.started_at) >= CALL_RING_TIMEOUT_MS);

  await Promise.all(timedOutCalls.map(async (call) => {
    const { error: updateError } = await client
      .from('chat_call_history')
      .update({ outcome: 'missed', ended_at: new Date(now).toISOString() })
      .eq('id', call.id)
      .eq('outcome', 'ringing')
      .select('id')
      .maybeSingle();
    if (updateError) throw updateError;
  }));

  const timedOutIds = new Set(timedOutCalls.map(({ id }) => id));
  return calls.map((call) =>
    timedOutIds.has(call.id) ? { ...call, outcome: 'missed' } : call);
}

export async function catatPanggilan(client, call) {
  const participants = [...new Set(call?.participantIds || [])];
  if (!UUID.test(call?.id || '') ||
      !UUID.test(call?.conversationId || '') ||
      !UUID.test(call?.startedBy || '') ||
      !participants.includes(call.startedBy) ||
      participants.length < 2 ||
      participants.length > MAX_CALL_HISTORY_PARTICIPANTS ||
      participants.some((id) => !UUID.test(id)) ||
      !MEDIA_KINDS.has(call?.mediaKind)) {
    throw new TypeError('Data riwayat panggilan tidak valid.');
  }

  const { error } = await client
    .from('chat_call_history')
    .upsert({
      id: call.id,
      conversation_id: call.conversationId,
      started_by: call.startedBy,
      participant_ids: participants,
      media_kind: call.mediaKind,
      outcome: 'ringing',
      started_at: call.startedAt || new Date().toISOString(),
    }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw error;
  return { id: call.id };
}

export async function selesaikanPanggilan(client, callId, outcome, endedAt = new Date().toISOString()) {
  if (!UUID.test(callId || '') || !TERMINAL_OUTCOMES.has(outcome) ||
      Number.isNaN(Date.parse(endedAt))) {
    throw new TypeError('Status akhir riwayat panggilan tidak valid.');
  }

  const { data, error } = await client
    .from('chat_call_history')
    .update({ outcome, ended_at: endedAt })
    .eq('id', callId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Riwayat panggilan tidak ditemukan atau tidak dapat diperbarui.');
  return data;
}
