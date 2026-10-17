// web/src/refs.js
/**
 * refs.js — Satu-satunya tempat yang tahu jalur dokumen Firestore.
 * Semua data sekolah berada di bawah /tenants/{tenantId}/..., sehingga isolasi
 * antar-sekolah dijaga oleh jalur ini DAN oleh firestore.rules.
 *
 *   import { refs } from './refs.js';
 *   const q = query(refs.perangkat(), where('ownerUid', '==', uid), orderBy('diubah', 'desc'));
 */
import { collection, doc } from 'firebase/firestore';
import { db } from './firebase.js';
import { getState } from './state.js';

function tid(tenantId) {
  const t = tenantId ?? getState().tenantId;
  if (!t) throw new Error('Sekolah (tenant) belum diketahui. Pastikan akun sudah aktif.');
  return t;
}

export const refs = {
  pengguna:    (uid)            => doc(db, 'users', uid),
  tenant:      (t)              => doc(db, 'tenants', tid(t)),

  perangkat:   (t)              => collection(db, 'tenants', tid(t), 'perangkat'),
  perangkatDoc:(id, t)          => doc(db, 'tenants', tid(t), 'perangkat', id),

  chats:       (t)              => collection(db, 'tenants', tid(t), 'chats'),
  chat:        (id, t)          => doc(db, 'tenants', tid(t), 'chats', id),
  pesan:       (chatId, t)      => collection(db, 'tenants', tid(t), 'chats', chatId, 'pesan'),

  pengumuman:  (t)              => collection(db, 'tenants', tid(t), 'pengumuman'),

  platform:    (dokumen)        => doc(db, 'platform', dokumen),   // khusus superadmin
};
