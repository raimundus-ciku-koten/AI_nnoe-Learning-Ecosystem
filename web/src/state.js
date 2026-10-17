// web/src/state.js
import { useSyncExternalStore } from 'react';

const state = {
  user: null,
  profile: null,
  role: null,
  tenantId: null,
  isDemo: false,
  claims: null,
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