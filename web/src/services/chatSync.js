// web/src/services/chatSync.js
/**
 * Sinkronisasi chat GLOBAL — berjalan sekali selama pengguna login (bukan per halaman):
 *   - daftar percakapan → state.chats / state.unreadChats
 *   - kontak            → state.kontak / state.permintaanMasuk / state.kontakSiap
 *   - presence (online/offline)
 *   - entri direktori milik sendiri
 *   - toast untuk notifikasi push saat aplikasi terbuka di halaman lain
 *
 * Menggantikan blok "LISTENER GLOBAL" di main.js.
 */
import { getState, setState, subscribe } from '../state.js';
import { rtdb } from '../firebase/index.js';
import { mulaiPantauDaftar } from './chat.js';
import { mulaiPresence, setOffline } from './presence.js';
import { pantauKontak, sinkronkanDirektoriSaya, hapusTembolokDirektori } from './contacts.js';
import { dengarkanForeground, lepaskanPerangkat } from './messaging.js';
import { toast } from '../utils/toast.js';

let uidAktif = null;
let pembatal = [];
let mulai = false;

const layak = (s) => Boolean(rtdb && s.user && s.role);

function berhentiSemua() {
  pembatal.forEach((fn) => { try { fn(); } catch { /* abaikan */ } });
  pembatal = [];
}

function selaraskan(state) {
  const uid = layak(state) ? state.user.uid : null;
  if (uid === uidAktif) return;

  berhentiSemua();
  hapusTembolokDirektori();
  uidAktif = uid;

  if (!uid) {
    setState({ chats: [], unreadChats: 0, kontak: [], permintaanMasuk: 0, kontakSiap: false });
    return;
  }

  pembatal.push(
    mulaiPantauDaftar(uid),
    mulaiPresence(uid),
    pantauKontak(uid, (entri) => setState({
      kontak: entri,
      permintaanMasuk: entri.filter((e) => e.status === 'pending' && e.arah === 'masuk').length,
      kontakSiap: true
    }))
  );
  sinkronkanDirektoriSaya().catch((error) => {
    console.error('[chat] Gagal menyinkronkan entri direktori pengguna:', error);
  });

  let dibatalkan = false;
  pembatal.push(() => { dibatalkan = true; });
  dengarkanForeground((d) => {
    const data = d?.data || {};
    if (getState().route === `/chat/${data.chatId}` && document.visibilityState === 'visible') return;
    toast(`${data.judul || 'Pesan baru'}: ${data.isi || ''}`, 'info');
  }).then((fn) => { if (dibatalkan) fn(); else pembatal.push(fn); }).catch(() => {});
}

/** Panggil sekali dari main.js. */
export function mulaiSinkronChat() {
  if (mulai) return;
  mulai = true;
  subscribe(selaraskan);
  selaraskan(getState());
}

/**
 * Panggil dari logout() SEBELUM signOut: tandai offline & lepas perangkat dari notifikasi.
 * Tidak pernah melempar galat.
 */
export async function hentikanChat() {
  const uid = uidAktif || getState().user?.uid;
  berhentiSemua();
  uidAktif = null;
  setState({ chats: [], unreadChats: 0, kontak: [], permintaanMasuk: 0, kontakSiap: false });
  if (!uid) return;
  await Promise.allSettled([setOffline(uid), lepaskanPerangkat(uid)]);
}
