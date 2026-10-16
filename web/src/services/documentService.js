/**
 * documentService.js — CRUD dokumen perencanaan guru.
 *
 * Menggantikan:
 *   - simpanHasilPerencanaan() → simpanDokumen()
 *   - getHasilPerencanaan()    → daftarDokumen() / daftarSemuaDokumen()
 *   - hapusHasilPerencanaan()  → hapusDokumen()
 *   - ambilIdHasilTerakhir_()  → otomatis lewat orderBy createdAt desc
 *
 * Struktur Firestore:
 *   /tenants/{tid}/perencanaan/{docId} = {
 *     uid:           'xxxx',           // pemilik
 *     jenis:         'rpe'|'atp'|'prota'|'prosem'|'kktp'|'modul'|'cover',
 *     mapel:         'Matematika',
 *     kelas:         'XI Fase F',
 *     semester:      'Ganjil'|'Genap'|'Tahun'|'',
 *     tahunAjaran:   '2026/2027',
 *     judul:         'RPE: Matematika — XI Fase F',
 *     html:          '...',            // naskah HTML hasil generate
 *     sumber:        'gemini'|'deepseek'|'deterministik',
 *     meta:          { totalJP, jpPerPekan, ... },
 *     createdAt:     Timestamp,
 *     updatedAt:     Timestamp
 *   }
 */
import {
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  query, where, orderBy, limit, onSnapshot,
  serverTimestamp, deleteDoc
} from 'firebase/firestore';
import { db } from '../firebase/index.js';
import { getState } from '../state.js';

// ---------------------------------------------------------------------------
// Resolver konteks (ambil dari state)
// ---------------------------------------------------------------------------
function ctx() {
  const state = getState();
  if (!state.user?.uid) throw new Error('Belum login.');
  if (!state.tenantId) throw new Error('Akun belum terhubung ke sekolah. Hubungi admin.');
  return { uid: state.user.uid, tenantId: state.tenantId };
}

function koleksi() {
  const { tenantId } = ctx();
  return collection(db, 'tenants', tenantId, 'perencanaan');
}

function refDoc(docId) {
  const { tenantId } = ctx();
  return doc(db, 'tenants', tenantId, 'perencanaan', docId);
}

// ---------------------------------------------------------------------------
// CREATE / UPDATE
// ---------------------------------------------------------------------------
/**
 * Simpan dokumen baru. Mengembalikan docId.
 *
 * @param {Object} payload
 *   - jenis        'rpe' | 'atp' | ...
 *   - mapel        string
 *   - kelas        string
 *   - semester     string (opsional)
 *   - tahunAjaran  string (opsional, default dari state.konteks)
 *   - judul        string (opsional, auto-generate)
 *   - html         string (naskah HTML lengkap)
 *   - sumber       string (opsional, 'gemini' | 'deepseek' | 'deterministik')
 *   - meta         object (opsional, data ringkasan)
 *
 * @return {Promise<string>} docId
 */
export async function simpanDokumen(payload) {
  const { uid, tenantId } = ctx();

  if (!payload?.jenis) throw new Error('Jenis dokumen wajib diisi.');
  if (!payload?.html || payload.html.length < 50) {
    throw new Error('Naskah HTML kosong atau terlalu pendek.');
  }

  const data = {
    uid,
    tenantId,
    jenis:        String(payload.jenis),
    mapel:        String(payload.mapel || '').trim(),
    kelas:        String(payload.kelas || '').trim(),
    semester:     String(payload.semester || '').trim(),
    tahunAjaran:  String(payload.tahunAjaran || getState().konteks?.tahunAjaran || '2026/2027'),
    judul:        payload.judul || defaultJudul(payload),
    html:         String(payload.html),
    sumber:       String(payload.sumber || 'unknown'),
    meta:         payload.meta || {},
    createdAt:    serverTimestamp(),
    updatedAt:    serverTimestamp()
  };

  const ref = await addDoc(koleksi(), data);
  return ref.id;
}

/**
 * Perbarui dokumen yang sudah ada (tanpa mengubah createdAt).
 */
export async function perbaruiDokumen(docId, patch) {
  const ref = refDoc(docId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) throw new Error('Dokumen tidak ditemukan.');
  if (snapshot.data().uid !== ctx().uid) {
    throw new Error('Anda tidak memiliki izin mengubah dokumen ini.');
  }
  await setDoc(ref, {
    ...patch,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

// ---------------------------------------------------------------------------
// READ
// ---------------------------------------------------------------------------
/**
 * Ambil satu dokumen by ID.
 */
export async function ambilDokumen(docId) {
  const snap = await getDoc(refDoc(docId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Daftar dokumen milik user, diurutkan createdAt desc.
 *
 * @param {Object} opts
 *   - jenis  filter jenis (opsional, mis. 'rpe')
 *   - mapel  filter mapel (opsional)
 *   - kelas  filter kelas (opsional)
 *   - limit  default 20
 */
export async function daftarDokumen(opts = {}) {
  const { uid } = ctx();
  const max = opts.limit || 20;

  const constraints = [where('uid', '==', uid)];
  if (opts.jenis) constraints.push(where('jenis', '==', opts.jenis));
  if (opts.mapel) constraints.push(where('mapel', '==', opts.mapel));
  if (opts.kelas) constraints.push(where('kelas', '==', opts.kelas));
  constraints.push(orderBy('createdAt', 'desc'));
  constraints.push(limit(max));

  const q = query(koleksi(), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Semua dokumen di sekolah (khusus admin sekolah).
 */
export async function daftarSemuaDokumen(opts = {}) {
  const max = opts.limit || 50;
  const constraints = [];
  if (opts.jenis) constraints.push(where('jenis', '==', opts.jenis));
  constraints.push(orderBy('createdAt', 'desc'));
  constraints.push(limit(max));

  const q = query(koleksi(), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Realtime listener untuk dashboard.
 * Mengembalikan unsubscribe().
 *
 * @param {Function} callback  (list) => void
 * @param {Object}   opts      { limit, jenis }
 */
export function pantaudaftarDokumen(callback, opts = {}) {
  const { uid } = ctx();
  const max = opts.limit || 10;

  const constraints = [where('uid', '==', uid)];
  if (opts.jenis) constraints.push(where('jenis', '==', opts.jenis));
  constraints.push(orderBy('createdAt', 'desc'));
  constraints.push(limit(max));

  const q = query(koleksi(), ...constraints);
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(list);
    },
    (err) => {
      console.error('[pantaudaftarDokumen]', err);
      callback([], err);
    }
  );
}

/**
 * Statistik dashboard: jumlah dokumen per jenis.
 * Menggunakan getCountFromServer untuk efisiensi (Firestore v10+).
 */
export async function statistikDokumen() {
  const { uid } = ctx();

  // Fetch 100 dokumen terakhir untuk agregasi client-side.
  // Untuk production skala besar, gunakan Cloud Function + counter.
  const constraints = [
    where('uid', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(100)
  ];
  const snap = await getDocs(query(koleksi(), ...constraints));

  const stats = {
    total: snap.size,
    byJenis: { rpe: 0, atp: 0, prota: 0, prosem: 0, kktp: 0, modul: 0, cover: 0 },
    terbaru: null,
    mapelSet: new Set(),
    kelasSet: new Set()
  };

  snap.forEach((d) => {
    const data = d.data();
    if (stats.byJenis[data.jenis] !== undefined) stats.byJenis[data.jenis]++;
    if (!stats.terbaru || (data.createdAt && data.createdAt > stats.terbaru.createdAt)) {
      stats.terbaru = { id: d.id, ...data };
    }
    if (data.mapel) stats.mapelSet.add(data.mapel);
    if (data.kelas) stats.kelasSet.add(data.kelas);
  });

  stats.jumlahMapel = stats.mapelSet.size;
  stats.jumlahKelas = stats.kelasSet.size;
  delete stats.mapelSet;
  delete stats.kelasSet;

  return stats;
}

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------
export async function hapusDokumen(docId) {
  const snap = await getDoc(refDoc(docId));
  if (!snap.exists()) throw new Error('Dokumen tidak ditemukan.');
  if (snap.data().uid !== ctx().uid) {
    const state = getState();
    if (!['admin_sekolah', 'superadmin'].includes(state.role)) {
      throw new Error('Anda tidak memiliki izin menghapus dokumen ini.');
    }
  }
  await deleteDoc(refDoc(docId));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function defaultJudul(payload) {
  const JENIS_LABEL = {
    rpe: 'RPE', atp: 'ATP', prota: 'Prota', prosem: 'Prosem',
    kktp: 'KKTP', modul: 'Modul Ajar', cover: 'Cover Perangkat'
  };
  const label = JENIS_LABEL[payload.jenis] || payload.jenis.toUpperCase();
  const parts = [label];
  if (payload.mapel) parts.push(payload.mapel);
  if (payload.kelas) parts.push(payload.kelas);
  return parts.join(' — ');
}