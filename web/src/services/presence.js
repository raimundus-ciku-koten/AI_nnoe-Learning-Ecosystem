// web/src/services/presence.js
import { ref, onValue, onDisconnect, set, serverTimestamp } from 'firebase/database';
import { rtdb } from '../firebase/index.js';

/** Tandai online selama koneksi hidup. Mengembalikan fungsi berhenti (sinkron). */
export function mulaiPresence(uid) {
  const koneksi = ref(rtdb, '.info/connected');
  const saya = ref(rtdb, `presence/${uid}`);
  return onValue(koneksi, async (snap) => {
    if (snap.val() === false) return;
    try {
      // Server menandai offline bila koneksi putus mendadak (tab ditutup, sinyal hilang).
      await onDisconnect(saya).set({ online: false, lastSeen: serverTimestamp() });
      await set(saya, { online: true, lastSeen: serverTimestamp() });
    } catch (e) {
      console.warn('[presence] gagal diperbarui:', e?.code || e);
    }
  });
}

/** Panggil SEBELUM signOut (aturan butuh auth). Tidak pernah melempar galat. */
export async function setOffline(uid) {
  try { await set(ref(rtdb, `presence/${uid}`), { online: false, lastSeen: serverTimestamp() }); }
  catch { /* abaikan */ }
}

export function pantauPresence(uid, callback) {
  return onValue(
    ref(rtdb, `presence/${uid}`),
    (snap) => callback(snap.val()),
    () => callback(null)
  );
}
