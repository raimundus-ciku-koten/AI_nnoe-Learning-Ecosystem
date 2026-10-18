// web/src/pages/dataDasar/kodeSiswa.js
// Kode unik siswa + URL scan. Mandiri (tanpa Firebase) agar mudah diuji.
//
// Format : ALE-<KELAS>-<HASH6>-<IDENT>
//   KELAS : A-Z0-9, maks 6 karakter (default 'KELAS')
//   HASH6 : FNV-1a 32-bit → base36 → UPPERCASE, 6 karakter
//   IDENT : 4 digit terakhir NISN/seed
// Contoh : ALE-7A-3F9K2P-9012

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
 * Kode unik deterministik. Bila `siswa.kodeUnik` sudah tersimpan, itu yang dipakai
 * (kode tidak berubah saat nama/kelas diedit).
 * @param {object} siswa
 * @param {string} [garam] — dipakai HANYA untuk memecah tabrakan hash.
 */
export function buatKodeSiswa(siswa, garam = '') {
  if (siswa?.kodeUnik) return String(siswa.kodeUnik);

  const kelas = String(siswa?.kelas || 'KELAS')
    .toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 6) || 'KELAS';

  const seed = String(
    siswa?.uid || siswa?.id ||
    `${siswa?.nama || ''}|${siswa?.nisn || ''}|${siswa?.kelas || ''}`
  );

  const hash = fnv1a32(seed + garam).toString(36).toUpperCase().padStart(6, '0').slice(-6);
  const ident = String(siswa?.nisn || seed).replace(/\D/g, '').slice(-4).padStart(4, '0');
  return `ALE-${kelas}-${hash}-${ident}`;
}

/** Validasi bentuk kode (dipakai halaman scan sebelum query ke Supabase). */
export const KODE_SISWA_REGEX = /^ALE-[A-Z0-9]{1,6}-[A-Z0-9]{6}-\d{4}$/;
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
