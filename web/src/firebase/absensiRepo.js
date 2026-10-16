// web/src/firebase/absensiRepo.js
/**
 * Pencatatan kehadiran dari pemindaian barcode.
 * ---------------------------------------------------------------------------
 *  - ID dokumen deterministik `${tanggal}_${siswaId}` + transaksi baca-lalu-tulis
 *    → memindai dua kali di hari yang sama TIDAK membuat data ganda (idempoten).
 *  - `waktu` memakai serverTimestamp(); aturan keamanan mewajibkan
 *    waktu == request.time sehingga jam perangkat tidak bisa dimanipulasi.
 *  - Tanggal dihitung pada zona waktu sekolah (bukan zona perangkat).
 */
import {
  collection, doc, query, where, limit, getDocs, runTransaction, serverTimestamp,
} from 'firebase/firestore';
import { db as firestoreDb } from './core/firestore.js';

export const KOLEKSI_SISWA = 'siswa';
export const KOLEKSI_ABSENSI = 'absensi';
/** Asia/Jakarta = WIB, Asia/Makassar = WITA, Asia/Jayapura = WIT. */
export const ZONA_WAKTU = 'Asia/Makassar';

const FORMAT_KODE = /^[A-Za-z0-9._-]{4,64}$/;

/** "YYYY-MM-DD" pada zona waktu sekolah. */
export function tanggalHariIni(tanggal = new Date(), zona = ZONA_WAKTU) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(tanggal);
}

export const idAbsensi = (tanggal, siswaId) => `${tanggal}_${siswaId}`;

/**
 * Cari siswa pemilik kode.
 * @returns {Promise<{id:string, nama:string, kelas:string, nisn:string}|null>}
 * @throws {Error} code 'kode-ganda' bila >1 siswa memakai kode yang sama.
 */
export async function cariSiswaDariKode(kode, db = firestoreDb) {
  const bersih = String(kode ?? '').trim();
  if (!FORMAT_KODE.test(bersih)) return null;

  const hasil = await getDocs(query(collection(db, KOLEKSI_SISWA), where('kodeUnik', '==', bersih), limit(2)));
  if (hasil.empty) return null;
  if (hasil.size > 1) {
    const err = new Error('Kode dipakai lebih dari satu siswa. Hubungi admin.');
    err.code = 'kode-ganda';
    throw err;
  }
  const d = hasil.docs[0];
  const data = d.data();
  return { id: d.id, nama: data.nama ?? '', kelas: data.kelas ?? '', nisn: data.nisn ?? '' };
}

/**
 * Catat hadir. Aman dipanggil berulang.
 * @returns {Promise<{baru:boolean, tanggal:string, waktu:Date|null}>}
 *          baru=false → sudah tercatat sebelumnya (waktu = waktu pencatatan awal).
 */
export async function catatHadir(siswa, uid, { db = firestoreDb, tanggal = tanggalHariIni() } = {}) {
  if (!uid) throw new Error('Anda harus masuk (login) untuk mencatat absensi.');
  const ref = doc(db, KOLEKSI_ABSENSI, idAbsensi(tanggal, siswa.id));

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) {
      return { baru: false, tanggal, waktu: snap.data().waktu?.toDate?.() ?? null };
    }
    tx.set(ref, {
      siswaId: siswa.id,
      kelas: siswa.kelas,
      tanggal,
      status: 'hadir',
      waktu: serverTimestamp(),
      dicatatOleh: uid,
      sumber: 'barcode',
    });
    return { baru: true, tanggal, waktu: null };
  });
}
