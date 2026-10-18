// web/src/pages/dataDasar/siswa/tulis.js
/**
 * Utilitas batas waktu penulisan yang tidak bergantung pada DOM.
 *
 * `tungguTulis` membatasi waktu tunggu UI tanpa menyamarkan hasil akhir
 * operasi Supabase yang masih berjalan.
 */

export const BATAS_TUNGGU_MS = 10_000;  // lewat ini, penulisan dianggap "tertunda"

export function pecah(daftar, ukuran) {
  const hasil = [];
  for (let i = 0; i < daftar.length; i += ukuran) hasil.push(daftar.slice(i, i + ukuran));
  return hasil;
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
