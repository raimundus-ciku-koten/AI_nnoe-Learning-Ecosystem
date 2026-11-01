const DATABASE_NAME = 'ainnoe-cover-history';
const STORE_NAME = 'cover-documents';
const DATABASE_VERSION = 1;
const MAX_LOGO_DATA_URL_LENGTH = 1_400_000;

const FIELD_LIMITS = {
  mapel: 100,
  kelas: 40,
  tahunAjaran: 30,
  penyusun: 100,
  sekolah: 150,
  tingkat: 80,
};

const FIELD_LABELS = {
  mapel: 'mata pelajaran',
  kelas: 'kelas/fase',
  tahunAjaran: 'tahun pelajaran',
  penyusun: 'penyusun',
  sekolah: 'nama sekolah',
  tingkat: 'jenjang',
};

function validasiPemilik(ownerUid) {
  if (typeof ownerUid !== 'string' || !ownerUid.trim() ||
      ownerUid.length > 128 || /[\u0000-\u001f]/.test(ownerUid)) {
    throw new Error('Akun lokal cover tidak valid. Muat ulang sesi dan coba lagi.');
  }
  return ownerUid.trim();
}

function validasiTeks(value, field, { required = false } = {}) {
  const label = FIELD_LABELS[field];
  if (typeof value !== 'string') {
    throw new Error(`Kolom ${label} harus berupa teks.`);
  }
  const normalized = value.trim();
  if (normalized.length > FIELD_LIMITS[field]) {
    throw new Error(`Kolom ${label} maksimal ${FIELD_LIMITS[field]} karakter.`);
  }
  if (required && !normalized) {
    throw new Error(`${label[0].toUpperCase()}${label.slice(1)} wajib diisi.`);
  }
  return normalized;
}

function validasiLogo(logoDataUrl) {
  if (logoDataUrl === '') return '';
  if (typeof logoDataUrl !== 'string' ||
      logoDataUrl.length > MAX_LOGO_DATA_URL_LENGTH ||
      !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(logoDataUrl)) {
    throw new Error('Logo harus berupa gambar PNG, JPEG, atau WebP yang valid dan berukuran maksimal 1 MB.');
  }
  return logoDataUrl;
}

export function validasiDataCover(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Data cover tidak valid.');
  }
  return {
    mapel: validasiTeks(input.mapel, 'mapel', { required: true }),
    kelas: validasiTeks(input.kelas, 'kelas', { required: true }),
    tahunAjaran: validasiTeks(input.tahunAjaran ?? '', 'tahunAjaran'),
    penyusun: validasiTeks(input.penyusun ?? '', 'penyusun'),
    sekolah: validasiTeks(input.sekolah ?? '', 'sekolah'),
    tingkat: validasiTeks(input.tingkat ?? '', 'tingkat'),
    logoDataUrl: validasiLogo(input.logoDataUrl ?? ''),
  };
}

function validasiRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record) ||
      record.schemaVersion !== DATABASE_VERSION ||
      typeof record.id !== 'string' || !record.id ||
      typeof record.ownerUid !== 'string' ||
      typeof record.createdAt !== 'string' ||
      Number.isNaN(Date.parse(record.createdAt))) {
    throw new Error('Riwayat cover lokal rusak atau memakai versi yang tidak didukung.');
  }
  validasiPemilik(record.ownerUid);
  return {
    ...record,
    data: validasiDataCover(record.data),
  };
}

function bukaDatabase() {
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error('Browser ini tidak mendukung penyimpanan riwayat cover lokal.'));
  }
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    let settled = false;
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        const store = request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('byOwner', 'ownerUid');
      }
    };
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => {
      if (settled) return;
      settled = true;
      reject(request.error || new Error('Riwayat cover lokal tidak dapat dibuka.'));
    };
    request.onblocked = () => {
      if (settled) return;
      settled = true;
      reject(new Error('Riwayat cover lokal sedang diblokir oleh tab lain. Tutup tab aplikasi lain lalu coba lagi.'));
    };
  });
}

function jalankanTransaksi(mode, tindakan) {
  return bukaDatabase().then((database) => new Promise((resolve, reject) => {
    let transaksi;
    let request;
    let settled = false;
    const selesai = (error, result) => {
      if (settled) return;
      settled = true;
      database.close();
      if (error) {
        reject(error.name === 'QuotaExceededError'
          ? new Error('Penyimpanan browser penuh. Hapus riwayat cover yang tidak diperlukan lalu coba lagi.', { cause: error })
          : error);
      } else {
        resolve(result);
      }
    };
    try {
      transaksi = database.transaction(STORE_NAME, mode);
      transaksi.oncomplete = () => selesai(null, request?.result);
      transaksi.onerror = () => selesai(
        transaksi.error || new Error('Transaksi riwayat cover lokal gagal.'),
      );
      transaksi.onabort = () => selesai(
        transaksi.error || new Error('Transaksi riwayat cover lokal dibatalkan.'),
      );
      request = tindakan(transaksi.objectStore(STORE_NAME), transaksi);
    } catch (error) {
      if (transaksi) transaksi.abort();
      selesai(error);
    }
  }));
}

function buatId() {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new Error('Browser tidak menyediakan pembuat ID aman untuk riwayat cover.');
  }
  return globalThis.crypto.randomUUID();
}

export async function simpanRiwayatCover(ownerUid, input) {
  const owner = validasiPemilik(ownerUid);
  const record = {
    id: buatId(),
    schemaVersion: DATABASE_VERSION,
    ownerUid: owner,
    createdAt: new Date().toISOString(),
    data: validasiDataCover(input),
  };
  await jalankanTransaksi('readwrite', (store) => store.put(record));
  return record;
}

export async function daftarRiwayatCover(ownerUid) {
  const owner = validasiPemilik(ownerUid);
  if (!globalThis.IDBKeyRange) {
    throw new Error('Browser tidak mendukung pencarian riwayat cover lokal.');
  }
  const records = await jalankanTransaksi('readonly', (store) =>
    store.index('byOwner').getAll(globalThis.IDBKeyRange.only(owner)));
  return records.map(validasiRecord)
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

export async function hapusRiwayatCover(ownerUid, recordId) {
  const owner = validasiPemilik(ownerUid);
  if (typeof recordId !== 'string' || !recordId.trim() || recordId.length > 128) {
    throw new Error('ID riwayat cover tidak valid.');
  }
  const record = await jalankanTransaksi('readwrite', (store, transaksi) => {
    const request = store.get(recordId);
    request.onsuccess = () => {
      if (request.result?.ownerUid === owner) store.delete(recordId);
    };
    return request;
  });
  return record?.ownerUid === owner;
}
