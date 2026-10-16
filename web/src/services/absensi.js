// web/src/services/absensi.js
/**
 * absensi.js — Akses Firestore untuk alur scan absensi.
 *
 * Struktur data:
 *   guru/{uid}/siswa/{siswaId}            (sudah ada)  — field: nama, kelas, nisn, kodeUnik
 *   guru/{uid}/absensi/{YYYY-MM-DD}_{siswaId}  (baru)  — satu dokumen per siswa per hari
 *
 * Anti-duplikat: ID dokumen deterministik + transaksi (baca → tulis hanya jika belum ada).
 * Security Rules (firebase/firestore.rules) menegakkan hal yang sama di sisi server.
 */
import { getAuth } from 'firebase/auth';
import {
  collection, doc, getDocs, limit, query, runTransaction, serverTimestamp, where,
} from 'firebase/firestore';
import { db } from '../firebase/index.js';
import { idAbsensi, kunciTanggal } from '../utils/scan-util.js';

/**
 * Tunggu Firebase Auth selesai memulihkan sesi, lalu kembalikan pengguna.
 * Tanpa ini, membuka tautan scan dari kamera (cold start) bisa salah dianggap "belum login"
 * karena currentUser masih null selama beberapa ratus milidetik.
 * @param {object|null} [cadangan] pengguna dari state aplikasi bila SDK tidak punya authStateReady
 * @returns {Promise<import('firebase/auth').User | object | null>}
 */
export async function tungguPengguna(cadangan = null) {
  const auth = getAuth();
  if (typeof auth.authStateReady === 'function') {
    try { await auth.authStateReady(); } catch { /* lanjut ke cadangan */ }
  }
  return auth.currentUser || cadangan || null;
}

/**
 * Cari siswa milik guru berdasarkan kodeUnik.
 * Query satu-field (==) → memakai indeks otomatis, tidak perlu indeks komposit.
 * @param {string} uid
 * @param {string} kode
 * @returns {Promise<({ id: string } & Record<string, any>) | null>}
 */
export async function cariSiswaByKode(uid, kode) {
  const q = query(collection(db, 'guru', uid, 'siswa'), where('kodeUnik', '==', kode), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

/**
 * Catat kehadiran hari ini secara atomik dan idempoten.
 * @param {string} uid
 * @param {{ id: string, nama?: string, kelas?: string, nisn?: string }} siswa
 * @param {string} kode
 * @returns {Promise<{ status: 'dicatat' | 'sudah', waktu: any }>}
 *   'sudah' berarti siswa ini sudah tercatat hadir hari ini (waktu = waktu catatan pertama).
 */
export async function catatKehadiran(uid, siswa, kode) {
  const tanggal = kunciTanggal();
  const ref = doc(db, 'guru', uid, 'absensi', idAbsensi(tanggal, siswa.id));

  return runTransaction(db, async (trx) => {
    const ada = await trx.get(ref);
    if (ada.exists()) {
      return { status: 'sudah', waktu: ada.data().waktu ?? null };
    }
    // Hanya field yang diizinkan Security Rules — jangan tambah field tanpa memperbarui rules.
    trx.set(ref, {
      siswaId: siswa.id,
      tanggal,
      status: 'hadir',
      metode: 'scan',
      kodeUnik: kode,
      nama: siswa.nama || '',
      kelas: siswa.kelas || '',
      waktu: serverTimestamp(),
    });
    return { status: 'dicatat', waktu: new Date() };
  });
}
