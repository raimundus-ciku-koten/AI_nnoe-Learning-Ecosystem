// web/src/galat.js
/**
 * galat.js — Terjemahan galat Firebase → pesan Indonesia yang bisa ditindaklanjuti.
 * Murni (tanpa impor Firebase) sehingga mudah diuji dan aman dipakai di mana saja.
 * Pesan tidak membocorkan detail teknis dan tidak membedakan "email tidak ada"
 * dari "sandi salah" (mencegah enumerasi akun).
 */

const PESAN = {
  // --- Authentication ---
  'auth/invalid-credential':       'Email atau kata sandi salah. Periksa lagi, atau atur ulang kata sandi.',
  'auth/wrong-password':           'Email atau kata sandi salah. Periksa lagi, atau atur ulang kata sandi.',
  'auth/user-not-found':           'Email atau kata sandi salah. Periksa lagi, atau atur ulang kata sandi.',
  'auth/invalid-email':            'Format email tidak valid.',
  'auth/user-disabled':            'Akun ini dinonaktifkan. Hubungi admin sekolah Anda.',
  'auth/too-many-requests':        'Terlalu banyak percobaan. Tunggu beberapa menit, lalu coba lagi.',
  'auth/network-request-failed':   'Tidak ada koneksi internet. Periksa jaringan Anda, lalu coba lagi.',
  'auth/popup-blocked':            'Jendela masuk Google diblokir browser. Izinkan pop-up untuk situs ini.',
  'auth/account-exists-with-different-credential':
                                   'Email ini sudah terdaftar dengan cara masuk lain. Masuk memakai email dan kata sandi.',
  'auth/unauthorized-domain':      'Domain ini belum diizinkan untuk masuk. Hubungi pengelola aplikasi.',
  'auth/operation-not-allowed':    'Cara masuk ini belum diaktifkan. Hubungi pengelola aplikasi.',
  'auth/requires-recent-login':    'Demi keamanan, masuk ulang lalu ulangi tindakan ini.',
  'auth/email-already-in-use':     'Email ini sudah terdaftar. Silakan masuk.',
  'auth/weak-password':            'Kata sandi terlalu lemah. Gunakan minimal 8 karakter.',
  'auth/invalid-api-key':          'Konfigurasi aplikasi bermasalah. Hubungi pengelola aplikasi.',
  'auth/app-not-authorized':       'Konfigurasi aplikasi bermasalah. Hubungi pengelola aplikasi.',
  'auth/internal-error':           'Terjadi gangguan di server masuk. Coba lagi beberapa saat lagi.',

  // --- Firestore ---
  'permission-denied':   'Anda tidak punya izin untuk tindakan ini, atau langganan sekolah sedang tidak aktif.',
  'unauthenticated':     'Sesi Anda berakhir. Silakan masuk kembali.',
  'unavailable':         'Server tidak dapat dijangkau. Perubahan akan dikirim saat koneksi kembali.',
  'deadline-exceeded':   'Server terlalu lama merespons. Coba lagi.',
  'resource-exhausted':  'Batas penggunaan tercapai. Coba lagi nanti.',
  'failed-precondition': 'Data belum siap (indeks mungkin sedang dibuat). Coba lagi sebentar lagi.',
  'aborted':             'Data berubah di saat bersamaan. Ulangi tindakan Anda.',
  'already-exists':      'Data tersebut sudah ada.',
  'not-found':           'Data tidak ditemukan.',

  // --- Internal ---
  'sesi/input-kosong':   'Isi email dan kata sandi.',
  'sesi/waktu-habis':    'Pemeriksaan sesi terlalu lama. Muat ulang halaman, lalu coba lagi.',
};

const PESAN_APPCHECK = 'Verifikasi keamanan perangkat gagal. Muat ulang halaman, lalu coba lagi.';
const PESAN_UMUM     = 'Terjadi kesalahan. Coba lagi beberapa saat lagi.';

const KODE_BATAL = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request']);

/** Kode kanonis: "firestore/permission-denied" → "permission-denied". */
export function kodeGalat(err) {
  const k = String(err?.code || '');
  return k.startsWith('firestore/') ? k.slice('firestore/'.length) : k;
}

/** true bila pengguna sendiri yang menutup/membatalkan (bukan kesalahan sebenarnya). */
export function galatDibatalkan(err) {
  return KODE_BATAL.has(kodeGalat(err));
}

/** Pesan Indonesia untuk galat apa pun. */
export function pesanGalat(err) {
  const k = kodeGalat(err);
  if (PESAN[k]) return PESAN[k];
  if (/^app-?check\//i.test(k)) return PESAN_APPCHECK;
  return PESAN_UMUM;
}

/** Bungkus galat asli menjadi Error ber-pesan Indonesia; kode & aslinya tetap tersedia. */
export function ubahGalat(err) {
  if (err instanceof Error && err.name === 'GalatSesi') return err;
  const e = new Error(pesanGalat(err));
  e.name  = 'GalatSesi';
  e.kode  = kodeGalat(err) || 'tidak-diketahui';
  e.asli  = err;
  return e;
}
