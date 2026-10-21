// web/src/utils/chatUtil.js
import { isEconomyMode } from '../services/economyMode.js';
/**
 * Fungsi murni untuk chat (tanpa DOM atau backend) agar mudah diuji dengan `node --test`.
 * Batas di sini harus sama dengan validasi layanan dan skema chat.
 */

export const MAKS_TEKS = 2000;               // database.rules.json: text <= 2000
export const MAKS_BERKAS = 2 * 1024 * 1024;
export const MAKS_ANGGOTA_GRUP = 50;         // Client-side group creation limit.
export const MAKS_JUDUL = 80;
export const MASA_AKTIF_PRESENCE = 90_000;

/** SVG sengaja tidak diizinkan (vektor XSS). */
export const TIPE_GAMBAR = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const TIPE_DOKUMEN = [
  'application/pdf', 'text/plain', 'application/msword',
  'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
];
export const ATRIBUT_ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,.pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx';

/** Legacy pair key retained only by the read-only contact reconciliation tool. */
export const idPribadi = (a, b) => `d_${[a, b].sort().join('_')}`;

/** Hanya huruf/angka/-/_ yang dipakai di ID. */
export const idValid = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(id);

export function jalurLampiranValid(path, chatId, uid) {
  if (typeof path !== 'string') return false;
  const bagian = /^chat\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{1,160})\/([A-Za-z0-9_.-]{1,120})$/.exec(path);
  return Boolean(bagian && bagian[2] === chatId && (!uid || bagian[1] === uid));
}

export function jalurLampiranDariUrl(url, chatId) {
  if (typeof url !== 'string' || url.length > 1200) return null;
  try {
    const parsed = new URL(url);
    const hostValid = parsed.protocol === 'https:' && parsed.hostname.endsWith('.supabase.co')
      || parsed.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname);
    if (!hostValid) return null;
    const bagian = /^\/storage\/v1\/object\/(?:sign|public)\/[^/]+\/(.+)$/.exec(parsed.pathname);
    if (!bagian) return null;
    const path = decodeURIComponent(bagian[1]);
    return jalurLampiranValid(path, chatId) ? path : null;
  } catch {
    return null;
  }
}

/** Hanya URL HTTPS dari storage Supabase (atau loopback lokal) yang boleh ditampilkan. */
export function urlAman(url) {
  if (typeof url !== 'string' || url.length > 1200) return false;
  try {
    const parsed = new URL(url);
    const hostValid = parsed.protocol === 'https:' && parsed.hostname.endsWith('.supabase.co')
      || parsed.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname);
    return hostValid && parsed.pathname.startsWith('/storage/v1/object/');
  } catch {
    return false;
  }
}

export function formatUkuran(byte) {
  const n = Number(byte);
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Nama berkas aman untuk jalur Storage. */
export function namaBerkasAman(nama) {
  const bersih = String(nama || 'berkas').normalize('NFKD').replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_');
  const potong = bersih.length > 80 ? bersih.slice(-80) : bersih;
  return potong.replace(/^[._]+/, '') || 'berkas';
}

export function namaLampiranTampil(nama) {
  const value = typeof nama === 'string' && nama.trim() ? nama.trim() : 'Berkas';
  return { nama: value, dikonversi: false };
}

/** @returns {{ok:true, jenis:'image'|'file'} | {ok:false, alasan:string}} */
export function periksaBerkas(berkas) {
  if (!berkas) return { ok: false, alasan: 'Tidak ada berkas.' };
  if (berkas.size === 0) return { ok: false, alasan: 'Berkas kosong.' };
  if (berkas.size > MAKS_BERKAS) return { ok: false, alasan: `Ukuran berkas maksimal ${formatUkuran(MAKS_BERKAS)}.` };
  if (TIPE_GAMBAR.includes(berkas.type)) return { ok: true, jenis: 'image' };
  if (TIPE_DOKUMEN.includes(berkas.type)) return { ok: true, jenis: 'file' };
  return { ok: false, alasan: 'Jenis berkas tidak didukung. Kirim gambar, PDF, teks, Word, Excel, atau PowerPoint.' };
}

export function ringkas(teks, maks) {
  const s = String(teks ?? '').replace(/\s+/g, ' ').trim();
  return s.length > maks ? `${s.slice(0, maks - 1)}…` : s;
}

/* ---------- Waktu ---------- */
const fJam  = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' });
const fHari = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fTgl  = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' });

export const jamMenit  = (ts) => (ts ? fJam.format(new Date(ts)) : '');
export const labelHari = (ts) => (ts ? fHari.format(new Date(ts)) : '');
export const kunciHari = (ts) => (ts ? new Date(ts).toDateString() : '');

/** Daftar chat: hari ini → jam; kemarin → "Kemarin"; selain itu → tanggal singkat. */
export function waktuDaftar(ts, sekarang = Date.now()) {
  if (!ts) return '';
  const d = new Date(ts);
  const s = new Date(sekarang);
  if (d.toDateString() === s.toDateString()) return fJam.format(d);
  const kemarin = new Date(s); kemarin.setDate(s.getDate() - 1);
  if (d.toDateString() === kemarin.toDateString()) return 'Kemarin';
  return fTgl.format(d);
}

export function statusTerakhirDilihat(presence, sekarang = Date.now()) {
  if (!presence) return '';
  if (presence.online) return 'Online';
  if (!presence.lastSeen) return '';
  const menit = Math.floor((sekarang - presence.lastSeen) / 60000);
  if (menit < 1) return 'Terakhir dilihat baru saja';
  if (menit < 60) return `Terakhir dilihat ${menit} menit lalu`;
  const d = new Date(presence.lastSeen);
  return d.toDateString() === new Date(sekarang).toDateString()
    ? `Terakhir dilihat pukul ${fJam.format(d)}`
    : `Terakhir dilihat ${fTgl.format(d)}`;
}

export function presenceMasihAktif(presence, sekarang = Date.now()) {
  const lastSeen = Number(presence?.lastSeen);
  const masaAktif = isEconomyMode()
    ? Math.max(MASA_AKTIF_PRESENCE, 240_000)
    : MASA_AKTIF_PRESENCE;
  return presence?.online === true
    && Number.isFinite(lastSeen)
    && lastSeen <= sekarang
    && sekarang - lastSeen <= masaAktif;
}

/** Pesan galat ramah pengguna dari layanan chat Supabase. */
export function pesanGalatChat(e, konteks = '') {
  const k = String((e && (e.code || e.message)) || '');
  if (e && e.name === 'GalatKontak') return e.message;
  if (e?.code === 'chat/attachment-unavailable') return e.message;
  if (e?.code === '42501' || /permission[-_]denied/i.test(k)) {
    return konteks === 'kirim'
      ? 'Pesan ditolak. Pastikan akses instansi atau kontak Anda masih aktif dan Anda anggota percakapan ini.'
      : 'Akses ditolak oleh aturan keamanan.';
  }
  if (/network|fetch failed|unavailable/i.test(k)) return 'Koneksi bermasalah. Coba lagi.';
  if (e?.code === 'PGRST301' || /jwt/i.test(k)) return 'Sesi berakhir. Silakan masuk kembali.';
  return 'Terjadi kesalahan. Silakan coba lagi.';
}
