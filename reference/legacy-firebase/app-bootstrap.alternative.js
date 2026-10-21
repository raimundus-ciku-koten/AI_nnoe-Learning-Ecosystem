// web/src/firebase/app.js
/**
 * Inisialisasi Firebase (SDK modular) — satu-satunya tempat konfigurasi.
 * ---------------------------------------------------------------------------
 *  - Idempoten: memakai app yang sudah ada bila sudah diinisialisasi di tempat lain.
 *  - Firestore dengan cache offline persisten multi-tab (jaringan sekolah sering putus).
 *  - App Check (reCAPTCHA Enterprise) aktif bila VITE_APPCHECK_SITE_KEY diisi.
 *  - Emulator Suite otomatis dipakai saat `vite dev` + VITE_USE_EMULATOR=true.
 *
 * Variabel lingkungan (Vite): lihat .env.example
 */
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import {
  initializeFirestore, getFirestore, connectFirestoreEmulator,
  persistentLocalCache, persistentMultipleTabManager,
} from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';

const env = import.meta.env ?? {};

const WAJIB = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID'];

function ambilKonfigurasi() {
  const hilang = WAJIB.filter((k) => !env[k]);
  if (hilang.length) {
    throw new Error(`Konfigurasi Firebase belum lengkap. Isi: ${hilang.join(', ')} (lihat .env.example).`);
  }
  return {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };
}

const pakaiEmulator = Boolean(env.DEV) && env.VITE_USE_EMULATOR === 'true';
const sudahAda = getApps().length > 0;

export const app = sudahAda ? getApp() : initializeApp(ambilKonfigurasi());

/* App Check — harus sebelum Firestore/Auth dipakai. Dilewati di emulator. */
if (!sudahAda && !pakaiEmulator && env.VITE_APPCHECK_SITE_KEY) {
  if (env.DEV) {
    // Token debug dicetak di konsol browser; daftarkan di Console → App Check → Apps → Manage debug tokens.
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = env.VITE_APPCHECK_DEBUG_TOKEN || true;
  }
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(env.VITE_APPCHECK_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (err) {
    console.warn('[firebase] App Check gagal diinisialisasi:', err);
  }
}

export const auth = getAuth(app);

function buatFirestore() {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    // Firestore sudah dimulai di modul lain → pakai instance yang ada.
    return getFirestore(app);
  }
}
export const db = buatFirestore();

if (pakaiEmulator && !sudahAda) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
