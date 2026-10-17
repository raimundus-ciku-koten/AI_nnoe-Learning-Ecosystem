// web/src/firebase.js
/**
 * firebase.js — Inisialisasi Firebase (SDK modular v10+).
 *
 * Urutan penting: App → App Check → Auth/Firestore. App Check harus aktif
 * SEBELUM layanan lain dipakai agar semua permintaan menyertakan token.
 *
 * Konfigurasi dibaca dari variabel lingkungan Vite (lihat web/.env.example).
 * Kunci web Firebase memang publik; yang melindungi data adalah Security Rules
 * dan App Check, bukan kerahasiaan kunci.
 */
import { initializeApp, getApps } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import {
  initializeFirestore, connectFirestoreEmulator,
  persistentLocalCache, persistentMultipleTabManager, memoryLocalCache,
  terminate, clearIndexedDbPersistence,
} from 'firebase/firestore';

const env = import.meta.env;

// Pastikan variabel terbaca sebagai boolean 'true'
export const adaEmulator = env.VITE_USE_EMULATOR === 'true';

const konfigurasi = {
  apiKey:            env.VITE_FIREBASE_API_KEY,
  authDomain:        env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         env.VITE_FIREBASE_PROJECT_ID,
  appId:             env.VITE_FIREBASE_APP_ID,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  storageBucket:     env.VITE_FIREBASE_STORAGE_BUCKET,
};

if (!konfigurasi.projectId || !konfigurasi.apiKey) {
  throw new Error('[firebase] Konfigurasi belum lengkap. Salin web/.env.example menjadi web/.env.local lalu isi nilainya.');
}

export const app = getApps()[0] ?? initializeApp(konfigurasi);

/* ---------- App Check ---------- */
// Emulator tidak memerlukan App Check. Saat pengembangan di server dev (bukan
// emulator), aktifkan token debug: salin token yang dicetak di konsol browser
// ke Firebase Console → App Check → Manage debug tokens.
export let appCheck = null;
if (!adaEmulator) {
  if (env.DEV) self.FIREBASE_APPCHECK_DEBUG_TOKEN = env.VITE_APPCHECK_DEBUG_TOKEN || true;
  if (env.VITE_APPCHECK_SITE_KEY) {
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(env.VITE_APPCHECK_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  } else if (!env.DEV) {
    console.warn('[firebase] VITE_APPCHECK_SITE_KEY kosong: App Check TIDAK aktif.');
  }
}

/* ---------- Auth ---------- */
export const auth = getAuth(app);
auth.languageCode = 'id';

/* ---------- Firestore ---------- */
// Cache lokal tahan-offline, aman multi-tab. Di emulator dipakai cache memori
// agar data uji tidak "menempel" antar-sesi.
export const db = initializeFirestore(app, {
  localCache: adaEmulator
    ? memoryLocalCache()
    : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

if (adaEmulator) {
  // HARDKODE '127.0.0.1' DI SINI untuk mencocokkan firebase.json dan terminal.
  // Jangan gunakan 'localhost' atau membiarkan env menimpanya dengan 'localhost' 
  // karena akan menyebabkan isu "Tidak dapat terhubung ke Firestore".
  const host = '127.0.0.1'; 
  
  console.info(`[firebase] Mode Emulator AKTIF. Menghubungkan ke ${host}...`);
  
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
}

/**
 * Hapus data Firestore yang tersimpan di perangkat. WAJIB dipanggil saat logout
 * karena komputer sekolah dipakai bergantian. Setelah ini halaman harus dimuat
 * ulang (instance Firestore sudah dihentikan).
 */
export async function bersihkanCacheLokal() {
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch (e) {
    console.warn('[firebase] Gagal membersihkan cache lokal:', e?.code || e);
  }
}