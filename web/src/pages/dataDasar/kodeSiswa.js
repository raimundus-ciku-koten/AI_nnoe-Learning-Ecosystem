// web/src/pages/dataDasar/kodeSiswa.js
// Kode unik siswa + URL scan. Mandiri (tanpa Firebase) agar mudah diuji.
import { buatKodeAcak } from '../../lib/kodeSiswa.js';

/** FNV-1a 32-bit (deterministik lintas runtime). */
export function fnv1a32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Token acak baru. Bila `siswa.kodeUnik` sudah tersimpan, gunakan itu.
 * @param {object} siswa
 */
export function buatKodeSiswa(siswa) {
  if (siswa?.kodeUnik) return String(siswa.kodeUnik);
  return buatKodeAcak();
}

/** Validasi bentuk kode (dipakai halaman scan sebelum query ke Supabase). */
export const KODE_SISWA_REGEX = /^(?:ALE-[0-9A-F]{32}|ALE-[A-Z0-9]{1,6}-[A-Z0-9]{6}-\d{4})$/;
export const kodeSiswaValid = (kode) => KODE_SISWA_REGEX.test(String(kode || '').trim());

/** Basis path aplikasi: buang nama berkas (index.html), pastikan diakhiri '/'. */
function basisPath(pathname) {
  if (!pathname) return '/';
  if (pathname.endsWith('/')) return pathname;
  const akhir = pathname.slice(pathname.lastIndexOf('/') + 1);
  return akhir.includes('.') ? pathname.slice(0, pathname.lastIndexOf('/') + 1) : `${pathname}/`;
}

/**
 * URL scan absensi: <origin><basePath>#/scan/<kode>
 * Daftarkan rute: daftar('/scan/:kode', halamanScan, { shell: false });
 * @param {string} kode
 * @param {string} [originCadangan] — dipakai bila tidak berjalan di browser.
 */
export function urlScanKode(kode, originCadangan = 'https://ainnoe.app') {
  const ada = typeof location !== 'undefined';
  const origin = String((ada && location.origin) || originCadangan).replace(/\/+$/, '');
  const path = ada ? basisPath(location.pathname) : '/';
  return `${origin}${path}#/scan/${encodeURIComponent(String(kode || '').trim())}`;
}
