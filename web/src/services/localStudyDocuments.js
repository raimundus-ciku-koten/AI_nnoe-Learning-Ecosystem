import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

const DATABASE_NAME = 'ainnoe-local-study-documents';
const STORE_NAME = 'documents';
const DATABASE_VERSION = 1;
const MAX_PDF_SIZE = 10 * 1024 * 1024;
const MAX_PAGES = 200;
const MAX_EXTRACTED_TEXT = 250_000;
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const MAX_DOCUMENTS_PER_USER = 10;
const STOP_WORDS = new Set([
  'adalah', 'agar', 'akan', 'atau', 'bagaimana', 'bahwa', 'belum', 'dalam', 'dan',
  'dari', 'dengan', 'di', 'ini', 'itu', 'jadi', 'karena', 'ke', 'ketika', 'kita',
  'lagi', 'lebih', 'maka', 'menjadi', 'oleh', 'pada', 'saat', 'saya', 'sebagai',
  'serta', 'sudah', 'tentang', 'tersebut', 'tidak', 'untuk', 'yang',
]);

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function validasiPemilik(uid) {
  if (typeof uid !== 'string' || !uid.trim() || uid.length > 128 ||
      /[\u0000-\u001f]/.test(uid)) {
    throw new Error('Akun lokal dokumen tidak valid. Muat ulang sesi dan coba lagi.');
  }
  return uid.trim();
}

function validasiId(documentId) {
  if (typeof documentId !== 'string' || !documentId.trim() || documentId.length > 128) {
    throw new Error('ID dokumen lokal tidak valid.');
  }
  return documentId;
}

function rentangPemilik(ownerUid) {
  if (!globalThis.IDBKeyRange) {
    throw new Error('Browser tidak mendukung pencarian dokumen lokal.');
  }
  return globalThis.IDBKeyRange.only(ownerUid);
}

function bukaDatabase() {
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error('Browser ini tidak mendukung penyimpanan dokumen lokal.'));
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
      reject(request.error || new Error('Penyimpanan dokumen lokal tidak dapat dibuka.'));
    };
    request.onblocked = () => {
      if (settled) return;
      settled = true;
      reject(new Error('Penyimpanan dokumen lokal sedang diblokir tab lain. Tutup tab aplikasi lain lalu coba lagi.'));
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
          ? new Error('Penyimpanan browser penuh. Hapus dokumen lokal yang tidak diperlukan lalu coba lagi.', { cause: error })
          : error);
      } else {
        resolve(result);
      }
    };
    try {
      transaksi = database.transaction(STORE_NAME, mode);
      transaksi.oncomplete = () => selesai(null, request?.result);
      transaksi.onerror = () => selesai(
        transaksi.error || new Error('Transaksi dokumen lokal gagal.'),
      );
      transaksi.onabort = () => selesai(
        transaksi.error || new Error('Transaksi dokumen lokal dibatalkan.'),
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
    throw new Error('Browser tidak menyediakan pembuat ID aman untuk dokumen lokal.');
  }
  return globalThis.crypto.randomUUID();
}

function pecahTeksHalaman(text, page) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const chunks = [];
  for (let start = 0; start < normalized.length; start += CHUNK_SIZE - CHUNK_OVERLAP) {
    const content = normalized.slice(start, start + CHUNK_SIZE).trim();
    if (content) chunks.push({ page, text: content });
  }
  return chunks;
}

async function ekstrakPotonganPdf(bytes) {
  const document = await pdfjs.getDocument({
    data: bytes.slice(),
    isEvalSupported: false,
    stopAtErrors: true,
  }).promise;
  try {
    if (!Number.isInteger(document.numPages) || document.numPages < 1 ||
        document.numPages > MAX_PAGES) {
      throw new Error(`PDF harus berisi 1 sampai ${MAX_PAGES} halaman.`);
    }
    const chunks = [];
    let extractedLength = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      try {
        const content = await page.getTextContent({ includeMarkedContent: false });
        const text = content.items
          .filter((item) => typeof item.str === 'string')
          .map((item) => `${item.str}${item.hasEOL ? '\n' : ' '}`)
          .join('');
        extractedLength += text.length;
        if (extractedLength > MAX_EXTRACTED_TEXT) {
          throw new Error('Teks PDF melebihi batas ekstraksi aman 250.000 karakter.');
        }
        chunks.push(...pecahTeksHalaman(text, pageNumber));
      } finally {
        page.cleanup();
      }
    }
    if (!chunks.length) {
      throw new Error('PDF tidak berisi teks yang dapat dibaca. PDF hasil pindai memerlukan OCR yang belum tersedia.');
    }
    return { chunks, pageCount: document.numPages };
  } finally {
    await document.destroy();
  }
}

function validasiRecord(record) {
  if (!record || typeof record !== 'object' ||
      typeof record.id !== 'string' ||
      typeof record.ownerUid !== 'string' ||
      typeof record.name !== 'string' ||
      !Number.isInteger(record.pageCount) || record.pageCount < 1 ||
      !Array.isArray(record.chunks) ||
      typeof record.createdAt !== 'string' ||
      Number.isNaN(Date.parse(record.createdAt)) ||
      record.chunks.some((chunk) => !chunk ||
        !Number.isInteger(chunk.page) || chunk.page < 1 ||
        typeof chunk.text !== 'string' || !chunk.text.trim())) {
    throw new Error('Indeks dokumen lokal rusak atau memakai format yang tidak didukung.');
  }
  return record;
}

export async function indeksDokumenBelajarLokal(uid, file) {
  const ownerUid = validasiPemilik(uid);
  if (!file || typeof file.arrayBuffer !== 'function' ||
      typeof file.name !== 'string' ||
      !Number.isFinite(file.size) || file.size < 5 || file.size > MAX_PDF_SIZE) {
    throw new TypeError('Pilih berkas PDF yang valid dan berukuran maksimal 10 MB.');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length !== file.size || new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') {
    throw new TypeError('Berkas yang dipilih bukan PDF yang valid.');
  }
  const existing = await jalankanTransaksi('readonly', (store) =>
    store.index('byOwner').getAll(rentangPemilik(ownerUid)));
  if (existing.length >= MAX_DOCUMENTS_PER_USER) {
    throw new RangeError(`Maksimal ${MAX_DOCUMENTS_PER_USER} dokumen dapat disimpan untuk akun ini.`);
  }
  const { chunks, pageCount } = await ekstrakPotonganPdf(bytes);
  const name = file.name.trim().replace(/[\u0000-\u001f]/g, '').slice(0, 150) || 'Dokumen PDF';
  const record = {
    id: buatId(),
    ownerUid,
    name,
    pageCount,
    chunks,
    createdAt: new Date().toISOString(),
  };
  await jalankanTransaksi('readwrite', (store) => store.add(record));
  return { id: record.id, name: record.name, pageCount, chunkCount: chunks.length };
}

export async function daftarDokumenBelajarLokal(uid) {
  const ownerUid = validasiPemilik(uid);
  const records = await jalankanTransaksi('readonly', (store) =>
    store.index('byOwner').getAll(rentangPemilik(ownerUid)));
  return records.map(validasiRecord)
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .map(({ id, name, pageCount, chunks, createdAt }) => ({
      id, name, pageCount, chunkCount: chunks.length, createdAt,
    }));
}

export async function hapusDokumenBelajarLokal(uid, documentId) {
  const ownerUid = validasiPemilik(uid);
  const id = validasiId(documentId);
  const record = await jalankanTransaksi('readwrite', (store, transaksi) => {
    const request = store.get(id);
    request.onsuccess = () => {
      if (request.result?.ownerUid === ownerUid) store.delete(id);
    };
    return request;
  });
  return record?.ownerUid === ownerUid;
}

function tokenisasi(text) {
  return (text.toLocaleLowerCase('id').normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .match(/[\p{L}\p{N}]{2,}/gu) || [])
    .filter((token) => !STOP_WORDS.has(token));
}

export async function cariKonteksDokumenLokal(uid, query, { limit = 4 } = {}) {
  const ownerUid = validasiPemilik(uid);
  if (typeof query !== 'string' || !query.trim() || query.length > 5000) {
    throw new TypeError('Pertanyaan pencarian dokumen lokal tidak valid.');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 4) {
    throw new RangeError('Jumlah sumber dokumen harus berupa bilangan bulat 1–4.');
  }
  const records = await jalankanTransaksi('readonly', (store) =>
    store.index('byOwner').getAll(rentangPemilik(ownerUid)));
  const chunks = records.map(validasiRecord)
    .flatMap((record) => record.chunks.map((chunk) => ({
      name: record.name,
      page: chunk.page,
      text: chunk.text,
      tokens: tokenisasi(chunk.text),
    })));
  const queryTokens = [...new Set(tokenisasi(query))];
  if (!chunks.length || !queryTokens.length) return [];

  const documentFrequency = new Map();
  for (const chunk of chunks) {
    for (const token of new Set(chunk.tokens)) {
      documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
    }
  }
  const averageLength = chunks.reduce((sum, chunk) => sum + chunk.tokens.length, 0) / chunks.length || 1;
  const ranked = chunks.map((chunk) => {
    const counts = new Map();
    for (const token of chunk.tokens) counts.set(token, (counts.get(token) || 0) + 1);
    const score = queryTokens.reduce((sum, token) => {
      const frequency = counts.get(token) || 0;
      if (!frequency) return sum;
      const idf = Math.log(1 + (chunks.length - (documentFrequency.get(token) || 0) + 0.5) /
        ((documentFrequency.get(token) || 0) + 0.5));
      const normalizedFrequency = (frequency * 2.2) /
        (frequency + 1.2 * (0.25 + 0.75 * chunk.tokens.length / averageLength));
      return sum + idf * normalizedFrequency;
    }, 0);
    return { ...chunk, score };
  });
  return ranked
    .filter((chunk) => chunk.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ name, page, text }) => ({ name, page, text }));
}
