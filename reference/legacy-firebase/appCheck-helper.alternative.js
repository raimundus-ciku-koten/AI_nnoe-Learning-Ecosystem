// web/src/firebaseAppCheck.js
/**
 * Mengaktifkan Firebase App Check (reCAPTCHA Enterprise / v3).
 * App Check membuktikan bahwa permintaan ke Firestore berasal dari aplikasi
 * Anda, bukan skrip lain yang memakai apiKey publik.
 *
 * Panggil SEKALI, tepat setelah initializeApp() dan SEBELUM getFirestore()
 * dipakai:
 *
 *   import { initializeApp } from 'firebase/app';
 *   import { aktifkanAppCheck } from './appCheck.js';
 *
 *   const app = initializeApp(firebaseConfig);
 *   aktifkanAppCheck(app, {
 *     siteKey: import.meta.env.VITE_RECAPTCHA_SITE_KEY,   // Vite; sesuaikan bundler
 *     debug: import.meta.env.DEV,
 *   });
 *
 * Mode debug (lokal): console peramban mencetak "App Check debug token" →
 * daftarkan di Firebase Console › App Check › Apps › Manage debug tokens.
 * Jangan pernah mengirim token debug ke repositori publik.
 */
import {
  initializeAppCheck, ReCaptchaEnterpriseProvider, ReCaptchaV3Provider,
} from 'firebase/app-check';

/**
 * @param {import('firebase/app').FirebaseApp} app
 * @param {{ siteKey?: string, penyedia?: 'enterprise' | 'v3', debug?: boolean, tokenDebug?: string }} [opsi]
 * @returns {import('firebase/app-check').AppCheck | null} null bila dinonaktifkan.
 */
export function aktifkanAppCheck(app, { siteKey, penyedia = 'enterprise', debug = false, tokenDebug } = {}) {
  if (!siteKey) {
    console.warn('[AppCheck] siteKey kosong — App Check TIDAK aktif.');
    return null;
  }
  if (debug) {
    // true → token acak dicetak di console; string → pakai token yang sudah didaftarkan.
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = tokenDebug || true;
  }
  return initializeAppCheck(app, {
    provider: penyedia === 'v3'
      ? new ReCaptchaV3Provider(siteKey)
      : new ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
}
