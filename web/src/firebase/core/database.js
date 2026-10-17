import { connectDatabaseEmulator, getDatabase } from 'firebase/database';
import { app, firebaseEnv, HOST_EMULATOR, pakaiEmulator } from './app.js';

export const rtdb = firebaseEnv.databaseURL ? getDatabase(app) : null;

if (rtdb && pakaiEmulator && !globalThis.__FB_RTDB_EMULATOR_CONNECTED__) {
  connectDatabaseEmulator(rtdb, HOST_EMULATOR, 9001);
  globalThis.__FB_RTDB_EMULATOR_CONNECTED__ = true;
}
