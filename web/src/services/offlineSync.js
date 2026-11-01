import { applyGoogleMutation } from './connectionApi.js';

const DATABASE_NAME = 'ainnoe-integrations';
const STORE_NAME = 'outbox';
const DATABASE_VERSION = 1;
const MAX_MUTATIONS = 1000;

function namaDatabase(uid) {
  const ownerId = String(uid || '').trim();
  if (!ownerId) throw new Error('ID pengguna diperlukan untuk membuka antrean sinkronisasi.');
  return `${DATABASE_NAME}-${ownerId}`;
}

function openOutbox(uid) {
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error('Browser ini tidak mendukung antrean sinkronisasi offline.'));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(namaDatabase(uid), DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'mutationId' });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Database antrean offline tidak dapat dibuka.'));
    request.onblocked = () => reject(new Error('Database antrean offline sedang dipakai tab lain.'));
  });
}

function withStore(uid, mode, action) {
  return openOutbox(uid).then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    let result;
    try {
      result = action(store);
    } catch (error) {
      database.close();
      reject(error);
      return;
    }
    transaction.oncomplete = () => {
      database.close();
      resolve(result?.result);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error('Perubahan antrean offline gagal disimpan.'));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error || new Error('Perubahan antrean offline dibatalkan.'));
    };
  }));
}

export function urutkanMutasiAntrean(mutations) {
  return [...mutations].sort((a, b) => a.createdAt.localeCompare(b.createdAt)
    || a.mutationId.localeCompare(b.mutationId));
}

export function tambahMutasiAntrean(uid, service, mutation) {
  if (!['drive', 'tasks', 'calendar'].includes(service)) {
    return Promise.reject(new TypeError('Layanan sinkronisasi tidak dikenal.'));
  }
  if (!uid) return Promise.reject(new Error('Masuk ke akun sebelum menyimpan perubahan offline.'));
  const entry = {
    ...mutation,
    mutationId: mutation?.mutationId || globalThis.crypto?.randomUUID?.(),
    service,
    createdAt: new Date().toISOString(),
  };
  if (!entry.mutationId) return Promise.reject(new Error('Browser tidak dapat membuat ID mutasi idempoten.'));
  return withStore(uid, 'readwrite', (store) => {
    const count = store.count();
    count.onsuccess = () => {
      if (count.result >= MAX_MUTATIONS) {
        store.transaction.abort();
        return;
      }
      store.put(entry);
    };
    return count;
  }).then(() => entry.mutationId).catch((error) => {
    if (error?.name === 'AbortError') throw new Error('Antrean offline mencapai batas 1.000 perubahan.');
    throw error;
  });
}

export async function hapusMutasiAntreanItem(uid, service, remoteId) {
  const entries = await daftarMutasiAntrean(uid);
  const matches = entries.filter((entry) =>
    entry.service === service && entry.remoteId === remoteId);
  for (const entry of matches) {
    await withStore(uid, 'readwrite', (store) => store.delete(entry.mutationId));
  }
  return matches.length;
}

export async function daftarMutasiAntrean(uid) {
  const result = await withStore(uid, 'readonly', (store) => store.getAll());
  return urutkanMutasiAntrean(result || []);
}

export async function bersihkanMutasiAntrean(uid) {
  await withStore(uid, 'readwrite', (store) => store.clear());
}

export async function kirimUlangMutasiAntrean(uid) {
  if (globalThis.navigator?.onLine === false) {
    return { sent: 0, queued: (await daftarMutasiAntrean(uid)).length, offline: true };
  }
  const queue = await daftarMutasiAntrean(uid);
  let sent = 0;
  let deferred = 0;
  for (const entry of queue) {
    if (entry.blocked || (entry.nextAttemptAt && Date.parse(entry.nextAttemptAt) > Date.now())) {
      deferred += 1;
      continue;
    }
    try {
      await applyGoogleMutation(entry.service, entry);
      await withStore(uid, 'readwrite', (store) => store.delete(entry.mutationId));
      sent += 1;
    } catch (error) {
      const attempts = (entry.attempts || 0) + 1;
      const retryable = error.status === 429 || error.status >= 500 ||
        error.name === 'TypeError' || error.name === 'AbortError';
      const retryAfter = Number(String(error.code || '').split(':')[1]);
      const delaySeconds = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter
        : Math.min(3600, 30 * (2 ** Math.min(attempts - 1, 7)));
      await withStore(uid, 'readwrite', (store) => store.put({
        ...entry,
        attempts,
        blocked: error.code === 'sync_conflict',
        nextAttemptAt: retryable
          ? new Date(Date.now() + delaySeconds * 1000).toISOString()
          : null,
        lastErrorCode: error.code || 'sync_failed',
      }));
      throw error;
    }
  }
  return { sent, queued: queue.length - sent, deferred, offline: false };
}

export async function antrikanAtauSinkronkan(uid, service, mutation) {
  const mutationId = await tambahMutasiAntrean(uid, service, mutation);
  if (globalThis.navigator?.onLine === false) {
    return { mutationId, queued: true, reason: 'offline' };
  }
  const result = await kirimUlangMutasiAntrean(uid);
  return { mutationId, queued: result.queued > 0, reason: result.queued ? 'retry_pending' : 'sent' };
}
