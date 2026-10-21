// web/src/components/header.js
/**
 * header.js — DEPRECATED (shim kompatibilitas).
 *
 * Topbar resmi aplikasi sekarang ada di ./sidebar.js (kelas "ale-*", gaya di
 * dashboard.css). Versi lama file ini memakai kelas BEM "topbar__*" yang sudah
 * tidak punya gaya, dan menyisipkan displayName ke innerHTML tanpa escape
 * (celah XSS bila nama pengguna berisi markup).
 *
 * Agar impor lama tetap jalan, header()/bindHeader() kini hanya mendelegasikan
 * ke sidebar.js. Bila tidak ada lagi yang mengimpor file ini, hapus saja.
 *
 *   import { topbar, pasangShell, setJudulHalaman } from './sidebar.js';
 */
import { topbar, pasangShell, setJudulHalaman } from './sidebar.js';

let judulTertunda = '';

/** @param {string} [title] Judul halaman (opsional; diterapkan saat bindHeader()). */
export function header(title) {
  judulTertunda = title ? String(title) : '';
  return topbar();
}

/** Pasang listener shell (idempoten) dan terapkan judul yang diminta. */
export function bindHeader() {
  pasangShell();
  if (judulTertunda) setJudulHalaman(judulTertunda);
}
