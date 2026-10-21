import { supabase } from '../lib/supabase.ts';

const channelId = () => globalThis.crypto?.randomUUID?.() || String(Date.now());

export async function kirimSinyalPanggilan({
  callId, conversationId, senderId, recipientId, eventType, payload = {},
}) {
  const { error } = await supabase.from('chat_call_signals').insert({
    call_id: callId,
    conversation_id: conversationId,
    sender_id: senderId,
    recipient_id: recipientId,
    event_type: eventType,
    payload,
  });
  if (error) throw error;
}

export function pantauSinyalPanggilan(uid, conversationId, callback) {
  let aktif = true;
  const channel = supabase
    .channel(`chat-call-signals:${uid}:${conversationId}:${channelId()}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'chat_call_signals',
      filter: `recipient_id=eq.${uid}`,
    }, ({ new: signal }) => {
      if (aktif && (!conversationId || signal.conversation_id === conversationId)) callback(signal);
    })
    .subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('[chat-call] langganan sinyal panggilan gagal:', error || status);
      }
    });
  return () => {
    aktif = false;
    void supabase.removeChannel(channel);
  };
}

export async function muatPanggilanMasuk(uid, conversationId) {
  const { data, error } = await supabase
    .from('chat_call_signals')
    .select('call_id,conversation_id,sender_id,recipient_id,event_type,payload,created_at')
    .eq('recipient_id', uid)
    .eq('conversation_id', conversationId)
    .in('event_type', ['offer', 'ice', 'end', 'reject'])
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  const signals = data || [];
  const offer = signals.find((signal) =>
    signal.event_type === 'offer' &&
    Date.now() - new Date(signal.created_at).getTime() < 60_000 &&
    !signals.some((later) =>
      later.call_id === signal.call_id &&
      (later.event_type === 'end' || later.event_type === 'reject') &&
      new Date(later.created_at) > new Date(signal.created_at)));
  if (!offer) return null;
  return {
    ...offer,
    pending_ice: signals
      .filter((signal) => signal.call_id === offer.call_id && signal.event_type === 'ice')
      .map((signal) => signal.payload?.candidate)
      .filter(Boolean),
  };
}
