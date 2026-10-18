// web/src/utils/scan-util.js
/**
 * scan-util.js — Fungsi murni (tanpa layanan backend/DOM) untuk halaman scan.
 * Dipisah agar mudah diuji dengan `node --test`.
 */

/** Panjang maksimum kode yang diterima (kode QR/barcode kartu siswa). */
export const KODE_MAKS = 64;

/** Karakter yang diizinkan pada kode: huruf, angka, titik, titik dua, strip, garis bawah. */
const POLA_KODE = /^[A-Za-z0-9._:-]+$/;

/**
 * Normalisasi + validasi kode hasil scan.
 * @param {unknown} mentah  nilai mentah dari ctx.params.kode
 * @returns {{ ok: true, kode: string } | { ok: false, alasan: 'kosong'|'terlalu-panjang'|'karakter' }}
 */
export function normalisasiKode(mentah) {
  let teks = String(mentah ?? '');
  // Router kadang sudah men-decode, kadang belum. Decode aman (abaikan jika rusak).
  try { teks = decodeURIComponent(teks); } catch { /* biarkan apa adanya */ }
  // Buang spasi, karakter kontrol, dan zero-width yang sering ikut dari scanner.
  teks = teks.replace(/[\u0000-\u001F\u007F​-‍﻿]/g, '').trim();

  if (!teks) return { ok: false, alasan: 'kosong' };
  if (teks.length > KODE_MAKS) return { ok: false, alasan: 'terlalu-panjang' };
  if (!POLA_KODE.test(teks)) return { ok: false, alasan: 'karakter' };
  return { ok: true, kode: teks };
}

const dua = (n) => String(n).padStart(2, '0');

/**
 * Kunci tanggal LOKAL perangkat (YYYY-MM-DD), bukan UTC.
 * Penting: di WITA (UTC+8) scan pukul 06:00 pagi adalah tanggal hari itu,
 * sedangkan toISOString() masih mengembalikan hari sebelumnya.
 * @param {Date} [tanggal]
 */
export function kunciTanggal(tanggal = new Date()) {
  return `${tanggal.getFullYear()}-${dua(tanggal.getMonth() + 1)}-${dua(tanggal.getDate())}`;
}

/**
 * Jam lokal HH:MM dari Date, objek timestamp, milidetik, atau nilai kosong.
 * @param {Date|{toDate:()=>Date}|number|string|null|undefined} nilai
 */
export function jamLokal(nilai) {
  if (nilai == null) return '';
  const d = typeof nilai?.toDate === 'function' ? nilai.toDate() : new Date(nilai);
  if (Number.isNaN(d.getTime())) return '';
  return `${dua(d.getHours())}:${dua(d.getMinutes())}`;
}

/**
 * ID dokumen absensi yang deterministik: satu siswa, satu dokumen per hari.
 * Inilah yang mencegah duplikasi saat kartu discan berulang / dari dua perangkat.
 * @param {string} tanggal  hasil kunciTanggal()
 * @param {string} siswaId  id dokumen siswa
 */
export function idAbsensi(tanggal, siswaId) {
  return `${tanggal}_${siswaId}`;
}

/** Pesan galat yang ramah pengguna dari layanan presensi. */
export function pesanGalat(err) {
  const kode = err?.code || '';
  if (kode === '42501' || kode === 'permission-denied') return 'Akses ditolak. Pastikan Anda login dengan akun guru yang benar.';
  if (kode === 'unavailable' || kode === 'deadline-exceeded' || /network|fetch failed/i.test(err?.message || ''))
    return 'Jaringan bermasalah. Periksa koneksi internet lalu coba lagi.';
  if (kode === 'unauthenticated' || kode === 'PGRST301') return 'Sesi login berakhir. Silakan masuk kembali.';
  if (kode === 'student/duplicate-code') return 'Kode dipakai lebih dari satu siswa. Hubungi admin.';
  return 'Terjadi kesalahan saat memproses scan. Coba lagi.';
}
