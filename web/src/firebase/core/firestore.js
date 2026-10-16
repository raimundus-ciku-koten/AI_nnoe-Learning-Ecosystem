import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { app, HOST_EMULATOR, pakaiEmulator } from './app.js';

const DATABASE_ID = 'default';

function buatFirestore() {
  const dasar = {
    ignoreUndefinedProperties: true,
    experimentalAutoDetectLongPolling: true,
  };

  try {
    return initializeFirestore(app, {
      ...dasar,
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    }, DATABASE_ID);
  } catch (err) {
    console.warn(
      '[firebase] Gagal init Firestore persisten, fallback ke cache default:',
      err?.message
    );
    try {
      return getFirestore(app, DATABASE_ID);
    } catch (fallbackError) {
      console.warn(
        '[firebase] Firestore database default gagal, memakai cache memori:',
        fallbackError?.message
      );
      return initializeFirestore(app, {
        ...dasar,
        localCache: memoryLocalCache(),
      }, DATABASE_ID);
    }
  }
}

export const db = buatFirestore();

if (pakaiEmulator && !globalThis.__FB_FIRESTORE_EMULATOR_CONNECTED__) {
  connectFirestoreEmulator(db, HOST_EMULATOR, 8080);
  globalThis.__FB_FIRESTORE_EMULATOR_CONNECTED__ = true;
}
