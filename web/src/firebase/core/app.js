import { getApp, getApps, initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';

const env = import.meta.env;

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
  databaseURL: env.VITE_FIREBASE_DATABASE_URL || undefined,
};

const WAJIB = ['apiKey', 'authDomain', 'projectId', 'appId'];
const kosong = WAJIB.filter((key) => !firebaseConfig[key]);

if (kosong.length) {
  throw new Error(
    `[firebase] Variabel .env.local belum lengkap: ${kosong.join(', ')}. ` +
    'Salin .env.example ke .env.local, isi nilainya, lalu restart npm run dev.'
  );
}

export const pakaiEmulator = env.VITE_USE_EMULATORS === 'true' && env.DEV;
export const firebaseEnv = Object.freeze(firebaseConfig);
export const HOST_EMULATOR = '127.0.0.1';
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export let appCheck = null;
const recaptchaSiteKey = env.VITE_RECAPTCHA_SITE_KEY;

if (recaptchaSiteKey && !pakaiEmulator) {
  try {
    if (env.DEV && env.VITE_APPCHECK_DEBUG_TOKEN) {
      self.FIREBASE_APPCHECK_DEBUG_TOKEN = env.VITE_APPCHECK_DEBUG_TOKEN;
    }

    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (err) {
    if (env.PROD) {
      throw new Error(
        '[firebase] App Check gagal diinisialisasi. Periksa site key dan konfigurasi domain produksi.',
        { cause: err }
      );
    }
    console.warn(
      '[firebase] App Check gagal diinisialisasi:',
      err?.code || err?.message || err
    );
  }
} else if (env.DEV) {
  console.info('[firebase] App Check dimatikan (tanpa site key atau menggunakan emulator).');
}

export async function ambilTokenAppCheck() {
  if (!appCheck) return null;
  const { getToken } = await import('firebase/app-check');
  return getToken(appCheck, false);
}
