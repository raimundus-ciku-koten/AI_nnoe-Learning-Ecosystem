import {
  browserSessionPersistence,
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  inMemoryPersistence,
  setPersistence,
} from 'firebase/auth';
import { app, HOST_EMULATOR, pakaiEmulator } from './app.js';

export const auth = getAuth(app);

export const persistenceReady = (async () => {
  try {
    await setPersistence(auth, browserLocalPersistence);
    return 'local';
  } catch (localError) {
    console.warn('[firebase/auth] Penyimpanan sesi permanen tidak tersedia; mencoba sesi tab:', localError?.code || localError?.message);
  }

  try {
    await setPersistence(auth, browserSessionPersistence);
    return 'session';
  } catch (sessionError) {
    console.warn('[firebase/auth] Penyimpanan sesi tab tidak tersedia; mencoba sesi sementara:', sessionError?.code || sessionError?.message);
  }

  try {
    await setPersistence(auth, inMemoryPersistence);
    return 'memory';
  } catch (cause) {
    throw Object.assign(
      new Error('Firebase Authentication tidak dapat menyiapkan penyimpanan sesi di browser ini.'),
      { code: 'auth/persistence-unavailable', cause },
    );
  }
})();

if (pakaiEmulator && !globalThis.__FB_AUTH_EMULATOR_CONNECTED__) {
  connectAuthEmulator(auth, `http://${HOST_EMULATOR}:9099`, { disableWarnings: true });
  globalThis.__FB_AUTH_EMULATOR_CONNECTED__ = true;
}
