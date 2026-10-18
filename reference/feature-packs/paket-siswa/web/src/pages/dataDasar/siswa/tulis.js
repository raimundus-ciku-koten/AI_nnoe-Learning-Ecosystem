// web/src/pages/dataDasar/siswa/tulis.js
/**
 * Utilitas penulisan Firestore yang tidak bergantung pada DOM.
 *
 * Catatan perilaku Firestore: promise setDoc/commit baru ter-resolve setelah
 * SERVER mengonfirmasi. Saat koneksi buruk ia bisa menggantung lama, padahal
 * perubahan sudah antre di klien. `tungguTulis` membatasi waktu tunggu UI.
 */
import { writeBatch } from 'firebase/firestore';

export const MAKS_BATCH = 400;          // batas Firestore: 500 operasi per batch
export const BATAS_TUNGGU_MS = 10_000;  // lewat ini, penulisan dianggap "tertunda"

export function pecah(daftar, ukuran) {
  const hasil = [];
  for (let i = 0; i < daftar.length; i += ukuran) hasil.push(daftar.slice(i, i + ukuran));
  return hasil;
}

/**
 * Tulis banyak operasi dalam beberapa batch (masing-masing ≤ MAKS_BATCH).
 * Semua batch diantre sekaligus (urutan terjaga). Bila ada yang gagal,
 * galat pertama dilempar dengan properti `jumlahTertulis` (operasi yang
 * sudah berhasil) — batch tidak atomik lintas bagian.
 */
export async function tulisBatch(db, daftarOperasi, isi, ukuran = MAKS_BATCH) {
  const bagian = pecah(daftarOperasi, ukuran);
  const hasil = await Promise.allSettled(bagian.map((b) => {
    const batch = writeBatch(db);
    b.forEach((x) => isi(batch, x));
    return batch.commit();
  }));

  const tertulis = hasil.reduce((n, h, i) => n + (h.status === 'fulfilled' ? bagian[i].length : 0), 0);
  const gagal = hasil.find((h) => h.status === 'rejected');
  if (gagal) {
    const err = gagal.reason instanceof Error ? gagal.reason : new Error(String(gagal.reason));
    err.jumlahTertulis = tertulis;
    throw err;
  }
  return tertulis;
}

/**
 * Tunggu satu penulisan maksimal `batas` ms.
 * Mengembalikan 'ok' | 'tunda'. Bila penulisan GAGAL sebelum batas,
 * promise ikut menolak. Pewaktu selalu dibersihkan.
 */
export function tungguTulis(janji, batas = BATAS_TUNGGU_MS) {
  janji.catch(() => { /* penolakan susulan ditangani pemanggil */ });
  let pewaktu;
  const tenggat = new Promise((selesai) => { pewaktu = setTimeout(() => selesai('tunda'), batas); });
  return Promise.race([janji.then(() => 'ok'), tenggat]).finally(() => clearTimeout(pewaktu));
}

/** Tolak bila `janji` tidak selesai dalam `batas` ms. */
export function denganBatas(janji, batas, pesan = 'Waktu habis') {
  let pewaktu;
  const tenggat = new Promise((_, tolak) => {
    pewaktu = setTimeout(() => tolak(new Error(pesan)), batas);
  });
  return Promise.race([janji, tenggat]).finally(() => clearTimeout(pewaktu));
}
