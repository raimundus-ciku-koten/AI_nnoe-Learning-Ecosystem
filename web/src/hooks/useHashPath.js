// web/src/hooks/useHashPath.js
import { useSyncExternalStore } from 'react';
import { normalizeHash } from '../routes.js';

function langganan(cb) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}
const ambil = () => normalizeHash(window.location.hash);

/** Path hash saat ini ('/dashboard'), reaktif terhadap `hashchange`. */
export function useHashPath() {
  return useSyncExternalStore(langganan, ambil, () => '/');
}
