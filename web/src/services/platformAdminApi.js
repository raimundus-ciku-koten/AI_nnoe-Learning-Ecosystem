import { sendPasswordResetEmail } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../firebase/core/app.js';
import { auth } from '../firebase/core/auth.js';

const REGION = import.meta.env.VITE_FUNCTIONS_REGION || 'asia-southeast2';

let functions;
let emulatorConnected = false;

function getPlatformFunctions() {
  if (!functions) functions = getFunctions(app, REGION);
  if (!emulatorConnected && import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true') {
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    emulatorConnected = true;
  }
  return functions;
}

export async function setPlatformControl(setting) {
  const call = httpsCallable(getPlatformFunctions(), 'setPlatformControl', { timeout: 20_000 });
  const { data } = await call(setting);
  if (!data || typeof data.changed !== 'boolean' || !data.state) {
    throw new Error('Respons kontrol platform tidak valid.');
  }
  return data;
}

export async function createPlatformUser(input) {
  const call = httpsCallable(getPlatformFunctions(), 'createPlatformUser', { timeout: 30_000 });
  const { data } = await call(input);
  if (!data || typeof data.uid !== 'string' || typeof data.email !== 'string' ||
      typeof data.role !== 'string' || typeof data.tenantId !== 'string') {
    throw new Error('Respons pembuatan akun tidak valid.');
  }

  let resetEmailSent = true;
  try {
    await sendPasswordResetEmail(auth, data.email);
  } catch (error) {
    console.error('[platform-users] Akun dibuat, tetapi email setel sandi gagal dikirim:', error);
    resetEmailSent = false;
  }

  return { ...data, resetEmailSent };
}
