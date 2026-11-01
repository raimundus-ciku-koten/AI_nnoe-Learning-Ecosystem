// web/src/state.js
import { useSyncExternalStore } from 'react';

const state = {
  user: null,
  profile: null,
  role: null,
  activeRole: null,
  roles: [],
  tenantId: null,
  isDemo: false,
  trialExpiresAt: null,
  claims: null,
  passwordRecovery: false,
  authReady: false,
  sidebarOpen: false,
  loadingMsg: null,
  chats: [],
  unreadChats: 0,
  kontak: [],
  permintaanMasuk: 0,
  kontakSiap: false,
  konteks: { mapel: '', kelas: '', tahunAjaran: '2026/2027' }
}; //[cite: 7]

const listeners = new Set();
let snapshot = { ...state };

export function getState() {
  return state;
}

export function setState(patch) {
  Object.assign(state, patch);
  snapshot = { ...state };
  for (const fn of listeners) {
    try { fn(state); }
    catch (e) { console.error('[state] listener error:', e); }
  }
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function shallowEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length
    && keys.every((key) => Object.prototype.hasOwnProperty.call(right, key)
      && Object.is(left[key], right[key]));
}

export function subscribeSelector(selector, fn, equal = Object.is) {
  let selected = selector(snapshot);
  const notify = () => {
    const next = selector(snapshot);
    if (equal(selected, next)) return;
    selected = next;
    fn(next);
  };
  listeners.add(notify);
  return () => listeners.delete(notify);
}

export function pilihStateAuth(current = snapshot) {
  return {
    user: current.user,
    profile: current.profile,
    role: current.role,
    activeRole: current.activeRole,
    roles: current.roles,
    tenantId: current.tenantId,
    isDemo: current.isDemo,
    trialExpiresAt: current.trialExpiresAt,
    passwordRecovery: current.passwordRecovery,
    authReady: current.authReady,
  };
}

export function getSnapshot() {
  return snapshot;
}

export function tunggu(predicate, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (predicate(state)) {
      resolve(state);
      return;
    }

    let unsubscribe;
    const timer = setTimeout(() => {
      unsubscribe?.();
      reject(new Error('Waktu tunggu perubahan state habis.'));
    }, timeoutMs);

    unsubscribe = subscribe((current) => {
      if (!predicate(current)) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(current);
    });
  });
}

// Custom Hook untuk komponen React
export function useAppState() {
  return useSyncExternalStore(subscribe, getSnapshot);
}

export const isGuru = () => state.role === 'guru'; //[cite: 7]
export const isAdminSekolah = () => state.role === 'admin_sekolah'; //[cite: 7]
export const isSuperAdmin = () => state.role === 'superadmin'; //[cite: 7]
export const isLoggedIn = () => !!state.user; //[cite: 7]