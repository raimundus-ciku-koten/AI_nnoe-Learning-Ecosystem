import { supabase } from '../lib/supabase.ts';
import { getState } from '../state.js';
import { muatDaftarChat } from './chat.js';
import { pantauKontak } from './contacts.js';
import { mulaiPresence, setOffline } from './presence.js';
import { lepaskanPerangkat } from './messaging.js';
import { pantauSinyalPanggilan } from './chatCalls.js';

let uidAktif = null;
let kanal = null;
let berhentiKontak = null;
let berhentiPresence = null;
let berhentiPanggilan = null;
let jadwalMuat = null;

function jadwalkanMuatInbox() {
  clearTimeout(jadwalMuat);
  jadwalMuat = setTimeout(() => {
    void muatDaftarChat().catch((error) => {
      console.error('[chat] sinkronisasi daftar gagal:', error);
    });
  }, 100);
}

function lepasListener() {
  clearTimeout(jadwalMuat);
  jadwalMuat = null;
  if (kanal) void supabase.removeChannel(kanal);
  kanal = null;
  berhentiKontak?.();
  berhentiKontak = null;
  berhentiPresence?.();
  berhentiPresence = null;
  berhentiPanggilan?.();
  berhentiPanggilan = null;
}

export function mulaiSinkronChat() {
  const uid = getState().user?.uid;
  if (!uid) return;
  if (uidAktif === uid) return;

  lepasListener();
  uidAktif = uid;
  void muatDaftarChat().catch((error) => {
    console.error('[chat] daftar percakapan gagal dimuat:', error);
  });
  berhentiKontak = pantauKontak(uid, () => {});
  berhentiPresence = mulaiPresence(uid);
  berhentiPanggilan = pantauSinyalPanggilan(uid, null, (signal) => {
    if (signal.event_type !== 'offer') return;
    const ruteAktif = window.location.hash.replace(/^#/, '').replace(/\/+$/, '');
    if (ruteAktif !== `/chat/${signal.conversation_id}`) {
      window.location.hash = `#/chat/${signal.conversation_id}`;
    }
  });

  kanal = supabase
    .channel(`chat-sync:${uid}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'chat_messages',
    }, jadwalkanMuatInbox)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'chat_conversations',
    }, jadwalkanMuatInbox)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'chat_read_receipts',
    }, jadwalkanMuatInbox)
    .subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('[chat] sinkronisasi realtime gagal:', error || status);
      }
    });
}

export async function hentikanChat() {
  const uid = uidAktif;
  uidAktif = null;
  lepasListener();
  if (!uid) return;

  const tasks = [
    setOffline(uid).catch((error) => {
      console.warn('[presence] status offline gagal disimpan:', error);
    }),
    lepaskanPerangkat(uid).catch((error) => {
      console.warn('[push] langganan perangkat gagal dilepas:', error);
    }),
  ];
  await Promise.all(tasks);
}
