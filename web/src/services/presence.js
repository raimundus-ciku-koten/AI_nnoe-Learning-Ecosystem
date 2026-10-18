import { supabase } from '../lib/supabase.ts';
import { intervalForEconomyMode, isEconomyMode } from './economyMode.js';
import { MASA_AKTIF_PRESENCE, presenceMasihAktif } from '../utils/chatUtil.js';

const HEARTBEAT_MS = intervalForEconomyMode(MASA_AKTIF_PRESENCE / 3);
const channelId = () => globalThis.crypto?.randomUUID?.() || String(Date.now());

async function simpanPresence(uid, online) {
  const { error } = await supabase
    .from('chat_presence')
    .upsert({
      user_id: uid,
      online,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  if (error) throw error;
}

export function mulaiPresence(uid) {
  if (!uid) return () => {};
  let aktif = true;
  const heartbeat = async () => {
    try {
      await simpanPresence(uid, true);
    } catch (error) {
      if (aktif) console.warn('[presence] gagal diperbarui:', error);
    }
  };
  void heartbeat();
  const interval = setInterval(heartbeat, HEARTBEAT_MS);
  return () => {
    aktif = false;
    clearInterval(interval);
  };
}

export async function setOffline(uid) {
  if (!uid) return;
  await simpanPresence(uid, false);
}

export function pantauPresence(uid, callback) {
  let aktif = true;
  let timerKedaluwarsa = null;
  const refresh = async () => {
    const { data, error } = await supabase
      .from('chat_presence')
      .select('online,last_seen_at')
      .eq('user_id', uid)
      .maybeSingle();
    if (error) {
      console.error('[presence] status gagal dimuat:', error);
      return;
    }
    if (!aktif) return;
    clearTimeout(timerKedaluwarsa);
    const presence = data ? {
      online: data.online,
      lastSeen: new Date(data.last_seen_at).getTime(),
    } : null;
    const online = presenceMasihAktif(presence);
    callback(presence ? { ...presence, online } : null);
    if (presence && online) {
      const batasAktif = isEconomyMode()
        ? Math.max(MASA_AKTIF_PRESENCE, 240_000)
        : MASA_AKTIF_PRESENCE;
      const sisa = batasAktif - (Date.now() - presence.lastSeen);
      timerKedaluwarsa = setTimeout(() => {
        if (aktif) callback({ ...presence, online: false });
      }, Math.max(0, sisa) + 1);
    }
  };
  const channel = supabase
    .channel(`presence:${uid}:${channelId()}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'chat_presence',
      filter: `user_id=eq.${uid}`,
    }, refresh)
    .subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('[presence] langganan status gagal:', error || status);
      }
    });
  void refresh();
  return () => {
    aktif = false;
    clearTimeout(timerKedaluwarsa);
    void supabase.removeChannel(channel);
  };
}
