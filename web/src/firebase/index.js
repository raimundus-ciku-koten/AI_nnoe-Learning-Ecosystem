import { app, appCheck, ambilTokenAppCheck, HOST_EMULATOR, pakaiEmulator } from './core/app.js';
import { auth } from './core/auth.js';
import { db } from './core/firestore.js';
import { rtdb } from './core/database.js';

export { app, appCheck, ambilTokenAppCheck, auth, db, rtdb };

let storagePromise;

export function ambilStorage() {
  if (!storagePromise) {
    storagePromise = import('firebase/storage')
      .then(({ connectStorageEmulator, getStorage }) => {
        const storage = getStorage(app);
        if (pakaiEmulator && !globalThis.__FB_STORAGE_EMULATOR_CONNECTED__) {
          connectStorageEmulator(storage, HOST_EMULATOR, 9199);
          globalThis.__FB_STORAGE_EMULATOR_CONNECTED__ = true;
        }
        return storage;
      })
      .catch((err) => {
        storagePromise = undefined;
        throw err;
      });
  }
  return storagePromise;
}

if (import.meta.env.DEV) {
  window.__fb = { app, auth, db, rtdb, appCheck };
}
