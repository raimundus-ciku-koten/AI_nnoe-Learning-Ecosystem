// web/src/services/messaging.js
import { getMessaging, getToken, deleteToken, onMessage, isSupported } from 'firebase/messaging';
import { ref, set, remove } from 'firebase/database';
import { app, rtdb } from '../firebase/index.js';
import { VAPID_KEY } from '../config.js';
import { kunciToken } from '../utils/chatUtil.js';

export const statusNotifikasi = () =>
  'Notification' in window ? Notification.permission : 'denied';

async function daftarkanSW() {
  return navigator.serviceWorker.register('/firebase-messaging-sw.js');
}

/** Harus dipanggil dari klik tombol (gestur pengguna). */
export async function aktifkanNotifikasi(uid) {
  if (!(await isSupported())) throw new Error('Peramban ini belum mendukung notifikasi.');
  const izin = await Notification.requestPermission();
  if (izin !== 'granted') throw new Error('Izin notifikasi tidak diberikan.');

  if (!VAPID_KEY) throw new Error('Kunci VAPID belum diisi (VITE_FIREBASE_VAPID_KEY).');

  const token = await getToken(getMessaging(app), {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: await daftarkanSW()
  });
  if (!token) throw new Error('Token notifikasi tidak diperoleh.');
  await set(ref(rtdb, `fcmTokens/${uid}/${kunciToken(token)}`), token);
  return token;
}

/** Notifikasi saat aplikasi sedang dibuka. Mengembalikan Promise<fungsi berhenti>. */
export async function dengarkanForeground(callback) {
  if (!(await isSupported())) return () => {};
  return onMessage(getMessaging(app), callback);
}

/** Lepas perangkat ini dari notifikasi (dipanggil saat keluar akun). Tidak melempar galat. */
export async function lepaskanPerangkat(uid) {
  try {
    if (!(await isSupported()) || statusNotifikasi() !== 'granted') return;
    const m = getMessaging(app);
    const token = await getToken(m, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: await daftarkanSW()
    });
    if (token) await remove(ref(rtdb, `fcmTokens/${uid}/${kunciToken(token)}`));
    await deleteToken(m);
  } catch { /* abaikan: keluar akun tidak boleh terhambat */ }
}
