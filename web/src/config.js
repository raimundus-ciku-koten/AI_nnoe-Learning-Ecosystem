// web/src/config.js
// Pengaturan yang boleh Anda ubah tanpa menyentuh kode lain.
export const NAMA_APLIKASI = 'AI_nnoe Learning Ecosystem';
export const SINGKATAN_APLIKASI = 'ALE';

// Alamat aplikasi perencanaan lama (Google Apps Script) yang ingin ditautkan dari dasbor.
// - Isi dengan URL deployment yang berakhiran /exec (bukan /dev, karena /dev hanya bisa dibuka pemilik skrip).
// - Harus diawali https://. Kosongkan ('') untuk menyembunyikan tautan "Perencanaan pembelajaran".
// Contoh: 'https://script.google.com/a/macros/domain-sekolah/s/XXXXXXXX/exec'
export const LINK_PERENCANAAN = '';
export const LINK_PERENCANAAN_AKTIF = /^https:\/\//i.test(LINK_PERENCANAAN)
  ? LINK_PERENCANAAN
  : '';

// Kunci web push (VAPID) untuk notifikasi: Firebase Console > Project settings > Cloud Messaging >
// Web Push certificates > Generate key pair. Simpan kunci publiknya sebagai variabel Vite.
export const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';