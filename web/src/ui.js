// web/src/ui.js
/**
 * ui.js — Helper UI terpusat (lintas halaman).
 *
 * Menggabungkan dua versi:
 *   - Versi lama  : esc, linkLuarAman, LABEL_PERAN, SUBJUDUL_PERAN, namaDariUser,
 *                   inisial, sapaanWaktu, formatWaktu, htmlAvatar, perbaruiAvatar
 *   - Versi baru  : ikon() memakai Bootstrap Icons, cache profil di localStorage
 *
 * Semua helper lama tetap dipertahankan supaya file lain (sidebar.js,
 * dashboard.js, dataDasar.js, dll.) tidak perlu diubah.
 */

import { toast } from './components/toast.js';
import { urlFotoAman } from './services/protectedMedia.js';

export { toast };

const KUNCI_SIDE_TUTUP = 'ale-side-tutup';

export function sideTutupTersimpan() {
  try {
    return localStorage.getItem(KUNCI_SIDE_TUTUP) === 'true';
  } catch (err) {
    console.warn('[ui] Preferensi sidebar tidak dapat dibaca:', err);
    return false;
  }
}

export function terapkanSideTutup(tutup) {
  document.documentElement.classList.toggle('ale-side-tutup', Boolean(tutup));
  try {
    localStorage.setItem(KUNCI_SIDE_TUTUP, String(Boolean(tutup)));
  } catch (err) {
    console.warn('[ui] Preferensi sidebar tidak dapat disimpan:', err);
  }
}

export function pulihkanSideTutup() {
  terapkanSideTutup(sideTutupTersimpan());
}

/* ============================================================
   KEAMANAN TEKS
   ============================================================ */

/** Escape HTML. WAJIB dipakai sebelum menaruh teks user ke innerHTML. */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** Hanya tautan https:// yang dianggap aman untuk dibuka dari menu. */
export const linkLuarAman = (u) => /^https:\/\//i.test(String(u || ''));

/* ============================================================
   PERAN
   ============================================================ */

export const LABEL_PERAN = {
  superadmin: 'Super Admin',
  admin_sekolah: 'Admin Sekolah',
  admin: 'Admin',
  operator: 'Operator',
  guru: 'Guru',
  kepala_sekolah: 'Kepala Sekolah',
  wali_kelas: 'Wali Kelas',
  guru_bk: 'Guru BK',
  guru_kokurikuler: 'Guru Kokurikuler',
  guru_ekstrakurikuler: 'Guru Ekstrakurikuler',
  siswa: 'Siswa',
  ortu: 'Orang Tua',
  orang_tua: 'Orang Tua',
};

export const SUBJUDUL_PERAN = {
  guru:          'Pantau jadwal, tugas, dan percakapan Anda dalam satu tempat.',
  operator:      'Bantu operasional sekolah sesuai peran dan hak akses Anda.',
  admin_sekolah: 'Kelola pengguna, kegiatan akademik, perangkat ajar, asesmen, dan komunikasi sekolah.',
  siswa:         'Lihat jadwal, tugas, dan pesan dari guru Anda.',
  ortu:           'Ikuti perkembangan anak dan hubungi guru lewat chat.',
  orang_tua:      'Ikuti perkembangan anak dan hubungi guru lewat chat.',
  superadmin:    'Kelola tenant, layanan, keamanan, fitur global, dan kesehatan platform.',
};

/* ============================================================
   NAMA & INISIAL
   ============================================================ */

export function namaDariUser(user) {
  if (!user) return 'Pengguna';
  return user.displayName
    || user.nama
    || (user.email ? String(user.email).split('@')[0] : '')
    || 'Pengguna';
}

/**
 * Inisial dari nama untuk avatar.
 *   "Raimundus Ciku Koten, S.Pd.,Gr." → "RC"  (gelar setelah koma diabaikan)
 *   "Maria"                           → "M"
 *   ""                                → "?"
 */
export function inisial(nama) {
  const kata = String(nama || '').split(',')[0].trim().split(/\s+/).filter(Boolean);
  if (!kata.length) return '?';
  return (kata[0][0] + (kata[1] ? kata[1][0] : '')).toUpperCase();
}

/* ============================================================
   WAKTU
   ============================================================ */

export function sapaanWaktu(d = new Date()) {
  const j = d.getHours();
  if (j >= 4  && j < 11) return 'Selamat pagi';
  if (j >= 11 && j < 15) return 'Selamat siang';
  if (j >= 15 && j < 18) return 'Selamat sore';
  return 'Selamat malam';
}

const fJam = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' });
const fTgl = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' });

/** Hari ini → jam (09.15); hari lain → tanggal (8 Okt). */
export function formatWaktu(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return d.toDateString() === new Date().toDateString()
    ? fJam.format(d)
    : fTgl.format(d);
}

/* ============================================================
   CACHE PROFIL — localStorage (per user, tahan reload)
   ============================================================ */

const KUNCI_PROFIL = 'ale:profil:map';

function bacaMap() {
  try { return JSON.parse(localStorage.getItem(KUNCI_PROFIL) || '{}'); }
  catch { return {}; }
}

function tulisMap(map) {
  try { localStorage.setItem(KUNCI_PROFIL, JSON.stringify(map)); }
  catch { /* private mode / quota — abaikan */ }
}

/** Ambil profil user dari cache localStorage. Return null jika belum ada. */
export function ambilProfil(uid) {
  if (!uid) return null;
  const map = bacaMap();
  return map[uid] || null;
}

/** Simpan/sebagian update profil user. Contoh: simpanProfil(uid, { nama, sekolah }). */
export function simpanProfil(uid, profil) {
  if (!uid) return;
  const map = bacaMap();
  map[uid] = { ...(map[uid] || {}), ...(profil || {}) };
  tulisMap(map);
}

/** Hapus cache profil user (panggil saat logout). */
export function hapusProfil(uid) {
  if (!uid) return;
  const map = bacaMap();
  delete map[uid];
  tulisMap(map);
}

/* ============================================================
   IKON — Bootstrap Icons
   ============================================================ */

/**
 * Peta nama ikon internal → nama Bootstrap Icons.
 *
 * Aturan:
 *   - Kalau nama ada di sini, dipetakan ke nilai.
 *   - Kalau TIDAK ada, nama dianggap sudah berupa nama Bootstrap Icons
 *     (mis. ikon('chat-dots') → <i class="bi bi-chat-dots">).
 *
 * Untuk menambah alias baru, cukup tambahkan baris di sini. Tidak perlu
 * menyentuh file lain.
 */
const NAMA_BI = {
  // --- Struktur & navigasi ---
  menu: 'list',
  tutup: 'x-lg',
  dasbor: 'speedometer2',
  rumah: 'house',
  kalender: 'calendar3',
  jam: 'clock',
  pengaturan: 'gear',
  keluar: 'box-arrow-right',
  pencarian: 'search',
  panah: 'chevron-right',
  turun: 'chevron-down',
  luar: 'box-arrow-up-right',
  titik3: 'three-dots-vertical',

  // --- Data & konten ---
  basisdata: 'database',
  buku: 'journal-bookmark',
  berkas: 'file-earmark-text',
  lapisan: 'layers',
  layout: 'grid-3x3',
  pena: 'pencil-square',

  // --- Pengguna ---
  pengguna: 'people',
  gedung: 'building',
  kartuid: 'person-vcard',

  // --- Status ---
  centang: 'check2-circle',
  silang: 'x-circle',
  peringatan: 'exclamation-triangle',
  lonceng: 'bell',
  kosong: 'inbox',

  // --- Aksi ---
  muat: 'arrow-clockwise',
  unggah: 'cloud-arrow-up',
  sampah: 'trash',
  kunciapi: 'key',
  tautan: 'link-45deg',
  obrolan: 'chat-dots',
  chat: 'chat-dots',
  ulasan: 'star',
  bintang: 'star-fill',
  google: 'google',
  saklar: 'toggle-on',
  ujian: 'clipboard-check',
  otomatis: 'stars',
  progres: 'bar-chart-line',
  tugas: 'check2-square',
  uang: 'cash-coin',
  perisai: 'shield-check',
  bohlam: 'lightbulb',

  // --- Barcode & absensi (menu Data Dasar) ---
  qr: 'qr-code',
  'qr-code': 'qr-code',
  qrcode: 'qr-code',
  barcode: 'upc-scan',
  scan: 'upc-scan',
  kartu: 'person-vcard',
  cetak: 'printer',
  unduh: 'download',

  // --- Data Dasar (sub-menu baru) ---
  'person-badge': 'person-badge',
  'qr-scanner': 'qr-code-scan',
};

/**
 * Render ikon Bootstrap Icons.
 *   ikon('gedung')                 → <i class="bi bi-building"></i>
 *   ikon('chat', 'fs-4 text-teal') → <i class="bi bi-chat-dots fs-4 text-teal"></i>
 *   ikon('qr-code')                → <i class="bi bi-qr-code"></i>
 *   ikon('qr')                     → <i class="bi bi-qr-code"></i>
 */
export function ikon(nama, kelas = '') {
  const n = String(nama || '').trim();
  if (!n) return '';
  const namaBi = NAMA_BI[n] || n;
  return `<i class="bi bi-${esc(namaBi)}${kelas ? ' ' + esc(kelas) : ''}" aria-hidden="true"></i>`;
}

/* ============================================================
   AVATAR
   ============================================================ */

/** HTML avatar (img atau span inisial). */
export function htmlAvatar(foto, nama) {
  const fallback = `<span class="ale-avatar" aria-hidden="true">${esc(inisial(nama))}</span>`;
  if (!urlFotoAman(foto)) return fallback;
  return `<img class="ale-avatar" src="${esc(foto)}" alt="" width="48" height="48" referrerpolicy="no-referrer">`;
}

/** Perbarui avatar di header (foto = '' berarti kembali ke inisial). */
export function perbaruiAvatar(foto, nama) {
  const w = document.getElementById('aleAvatarWrap');
  if (!w) return;
  w.innerHTML = htmlAvatar(/^https:\/\//i.test(foto || '') ? foto : '', nama);
}