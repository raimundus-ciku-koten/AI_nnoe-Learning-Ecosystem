import {
  validasiIdMigrasiSintetis,
  validasiPaketTerenkripsiMigrasiSintetis,
} from './identityDataMigrationPrototype.js';

const DATABASE_NAME = 'ainnoe-identity-migration-synthetic-prototype';
const STORE_NAME = 'encrypted-records';
const DATABASE_VERSION = 1;

function openDatabase() {
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error('Browser ini tidak mendukung penyimpanan IndexedDB lokal.'));
  }
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    let settled = false;
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'recordId' });
      }
    };
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      resolve(request.result);
    };
    request.onerror = () => {
      if (settled) return;
      settled = true;
      reject(request.error || new Error('Database fixture lokal tidak dapat dibuka.'));
    };
    request.onblocked = () => {
      if (settled) return;
      settled = true;
      reject(new Error('Database fixture lokal sedang diblokir oleh tab lain.'));
    };
  });
}

function withStore(mode, action) {
  return openDatabase().then((database) => new Promise((resolve, reject) => {
    let transaction;
    let request;
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      database.close();
      if (error) {
        reject(error.name === 'QuotaExceededError'
          ? new Error('Penyimpanan lokal browser penuh; fixture tidak disimpan.', { cause: error })
          : error);
      } else {
        resolve(result);
      }
    };
    try {
      transaction = database.transaction(STORE_NAME, mode);
      transaction.oncomplete = () => finish(null, request?.result);
      transaction.onerror = () => finish(
        transaction.error || new Error('Transaksi fixture lokal gagal.'),
      );
      transaction.onabort = () => finish(
        transaction.error || new Error('Transaksi fixture lokal dibatalkan.'),
      );
      request = action(transaction.objectStore(STORE_NAME), transaction);
    } catch (error) {
      if (transaction) transaction.abort();
      finish(error);
    }
  }));
}

export async function simpanPaketMigrasiSintetisLokal(record) {
  validasiPaketTerenkripsiMigrasiSintetis(record);
  await withStore('readwrite', (store) => store.put(record));
  return record.recordId;
}

export async function ambilPaketMigrasiSintetisLokal(recordId) {
  validasiIdMigrasiSintetis(recordId);
  const record = await withStore('readonly', (store) => store.get(recordId));
  return record === undefined ? undefined : validasiPaketTerenkripsiMigrasiSintetis(record);
}

export async function daftarPaketMigrasiSintetisLokal() {
  const records = await withStore('readonly', (store) => store.getAll());
  return records.map(validasiPaketTerenkripsiMigrasiSintetis);
}

export async function hapusPaketMigrasiSintetisLokal(recordId) {
  validasiIdMigrasiSintetis(recordId);
  await withStore('readwrite', (store) => store.delete(recordId));
}
