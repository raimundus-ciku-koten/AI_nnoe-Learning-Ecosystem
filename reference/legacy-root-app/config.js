// web/src/config.js
// Pengaturan yang boleh Anda ubah tanpa menyentuh kode lain.

export const NAMA_APLIKASI = 'AI_nnoe Learning Ecosystem';
export const SINGKATAN_APLIKASI = 'ALE';

// Alamat aplikasi perencanaan lama (Google Apps Script) yang ditautkan dari dasbor.
// - Isi URL deployment yang berakhiran /exec (bukan /dev; /dev hanya untuk pemilik skrip).
// - Harus diawali https://. Kosongkan ('') untuk menyembunyikan tautan "Perencanaan pembelajaran".
// Contoh: 'https://script.google.com/a/macros/domain-sekolah/s/XXXXXXXX/exec'
export const LINK_PERENCANAAN = '';

// Kunci web push (VAPID): Firebase Console > Project settings > Cloud Messaging >
// Web Push certificates > Generate key pair, lalu tempel kunci publiknya di sini.
// Selama kosong, menu "Aktifkan Notifikasi" hanya menampilkan pesan bahwa kunci belum diisi.
export const VAPID_KEY = '';

/** URL valid hanya bila https:// dan hostname-nya terbaca. */
export function urlHttpsValid(url) {
  if (typeof url !== 'string' || !url.trim()) return false;
  try {
    const u = new URL(url.trim());
    return u.protocol === 'https:' && Boolean(u.hostname);
  } catch {
    return false;
  }
}

/** Tautan perencanaan siap pakai (string) atau null bila kosong/tidak valid. */
export const LINK_PERENCANAAN_AKTIF = urlHttpsValid(LINK_PERENCANAAN)
  ? LINK_PERENCANAAN.trim()
  : null;

export const NOTIFIKASI_SIAP = Boolean(VAPID_KEY && VAPID_KEY.trim());
