// src/core/store.js
// Adapter — re-export dari state.js supaya views/chat/* tidak perlu diubah.
// Kalau state.js Anda sudah punya `subscribe`, ini akan langsung jalan.
export { getState, setState } from '../state.js';

// Fallback subscribe bila state.js belum menyediakannya.
// Hapus blok ini kalau state.js sudah punya `subscribe`.
import { getState, setState } from '../state.js';

const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Bungkus setState agar otomatis memanggil subscriber
const _setStateAsli = setState;
export function setStateDanNotify(patch) {
  _setStateAsli(patch);
  const s = getState();
  listeners.forEach((fn) => { try { fn(s); } catch (e) { console.error(e); } });
}