import { supabase } from '../lib/supabase.ts';

const DATABASE_NAME = 'ainnoe-lesson-journal-audit';
const STORE_NAME = 'events';
const DATABASE_VERSION = 1;
const MAX_EVENTS = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_ACTIONS = new Set(['created', 'updated', 'deleted']);
const ALLOWED_FIELDS = new Set([
  'tanggal', 'kelas', 'mapel', 'jam', 'materi', 'kegiatan',
  'kendala', 'tindakLanjut', 'status',
]);

function databaseName(userId) {
  if (typeof userId !== 'string' || !UUID.test(userId)) {
    throw new TypeError('Identitas pengguna audit tidak valid.');
  }
  return `${DATABASE_NAME}-${userId}`;
}

function openOutbox(userId) {
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error('Browser tidak mendukung antrean audit lokal.'));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName(userId), DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'eventId' });
        store.createIndex('occurredAt', 'occurredAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Antrean audit lokal tidak dapat dibuka.'));
    request.onblocked = () => reject(new Error('Antrean audit sedang dipakai tab lain.'));
  });
}

function withStore(userId, mode, action) {
  return openOutbox(userId).then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    let request;
    try {
      request = action(store);
    } catch (error) {
      database.close();
      reject(error);
      return;
    }
    transaction.oncomplete = () => {
      database.close();
      resolve(request?.result);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error('Antrean audit lokal gagal diperbarui.'));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error || new Error('Perubahan antrean audit dibatalkan.'));
    };
  }));
}

export function buatEventAuditJurnal({
  journalId,
  action,
  changedFields,
  occurredAt = new Date().toISOString(),
}) {
  if (!UUID.test(journalId || '') || !ALLOWED_ACTIONS.has(action)) {
    throw new TypeError('Identitas atau aksi audit jurnal tidak valid.');
  }
  if (!Array.isArray(changedFields) || changedFields.length < 1 ||
      changedFields.length > ALLOWED_FIELDS.size ||
      changedFields.some((field) => !ALLOWED_FIELDS.has(field)) ||
      new Set(changedFields).size !== changedFields.length) {
    throw new TypeError('Daftar field audit jurnal tidak valid.');
  }
  if (typeof occurredAt !== 'string' ||
      !Number.isFinite(Date.parse(occurredAt)) ||
      new Date(occurredAt).toISOString() !== occurredAt) {
    throw new TypeError('Waktu audit jurnal tidak valid.');
  }
  const eventId = globalThis.crypto?.randomUUID?.();
  if (!eventId) throw new Error('Browser tidak dapat membuat ID audit yang unik.');
  return {
    eventId,
    journalId: journalId.toLowerCase(),
    action,
    changedFields: [...new Set(changedFields)].sort(),
    occurredAt,
  };
}

export async function antrekanEventAuditJurnal(userId, event) {
  if (!event || !UUID.test(event.eventId || '') ||
      !UUID.test(event.journalId || '') ||
      Object.keys(event).sort().join(',') !== 'action,changedFields,eventId,journalId,occurredAt' ||
      !ALLOWED_ACTIONS.has(event.action) ||
      !Array.isArray(event.changedFields) ||
      event.changedFields.length < 1 ||
      event.changedFields.length > ALLOWED_FIELDS.size ||
      event.changedFields.some((field) => !ALLOWED_FIELDS.has(field)) ||
      new Set(event.changedFields).size !== event.changedFields.length ||
      typeof event.occurredAt !== 'string' ||
      !Number.isFinite(Date.parse(event.occurredAt)) ||
      new Date(event.occurredAt).toISOString() !== event.occurredAt) {
    throw new TypeError('Peristiwa audit jurnal tidak valid.');
  }
  return withStore(userId, 'readwrite', (store) => {
    const count = store.count();
    count.onsuccess = () => {
      if (count.result >= MAX_EVENTS) {
        store.transaction.abort();
        return;
      }
      store.put(event);
    };
    return count;
  }).then(() => event.eventId).catch((error) => {
    if (error?.name === 'AbortError') {
      throw new Error('Antrean audit lokal mencapai batas 1.000 peristiwa.');
    }
    throw error;
  });
}

export async function jumlahEventAuditJurnal(userId) {
  const count = await withStore(userId, 'readonly', (store) => store.count());
  return Number.isInteger(count) ? count : 0;
}

export async function kirimAntreanAuditJurnal(userId) {
  const events = await withStore(userId, 'readonly', (store) => store.getAll());
  if (!events?.length) return { submitted: 0, queued: 0, expired: 0 };
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('Sesi login berakhir. Masuk kembali untuk mengirim catatan aktivitas.');

  let submitted = 0;
  let serverPending = 0;
  let expired = 0;
  for (const event of events) {
    const response = await fetch('/api/audit/lesson-journal', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json().catch(() => ({}));
    if (response.status === 410 && result.code === 'journal_audit_expired') {
      await withStore(userId, 'readwrite', (store) => store.delete(event.eventId));
      expired += 1;
      continue;
    }
    if (!response.ok) {
      throw new Error(result.detail || result.error || 'Catatan aktivitas belum dapat dikirim.');
    }
    await withStore(userId, 'readwrite', (store) => store.delete(event.eventId));
    submitted += 1;
    if (response.status === 202 || result.status === 'pending') serverPending += 1;
  }
  return {
    submitted,
    queued: await jumlahEventAuditJurnal(userId),
    serverPending,
    expired,
  };
}

export async function cobaKirimUlangAuditJurnal() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('Sesi login berakhir. Masuk kembali untuk mengirim catatan aktivitas.');
  const response = await fetch('/api/audit/lesson-journal', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify({ retryPending: true }),
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.detail || result.error || 'Pengiriman ulang audit belum berhasil.');
  }
  return result;
}
