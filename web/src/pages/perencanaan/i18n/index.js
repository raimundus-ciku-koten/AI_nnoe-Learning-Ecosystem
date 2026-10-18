/**
 * @file i18n ringan. Bahasa Indonesia adalah sumber utama; bahasa lain cukup menambah kamus
 * dan didaftarkan di KAMUS. Kunci yang belum diterjemahkan jatuh ke Indonesia, lalu ke kunci itu sendiri.
 */
import id from './id.js';

const KAMUS = { id };
const BCP47 = { id: 'id-ID', en: 'en-US' };
let aktif = 'id';

/** Daftarkan kamus bahasa baru, mis. daftarkanBahasa('en', kamusEn). */
export function daftarkanBahasa(kode, kamus) { KAMUS[kode] = kamus; }
export function setBahasa(kode) { if (KAMUS[kode]) aktif = kode; }
/** Kode lokal BCP-47 untuk Intl. */
export const lokal = () => BCP47[aktif] ?? 'id-ID';

/**
 * Terjemahkan kunci, isi {parameter}.
 * @param {string} kunci
 * @param {Record<string, string|number>} [param]
 */
export function t(kunci, param) {
  const teks = KAMUS[aktif]?.[kunci] ?? KAMUS.id[kunci] ?? kunci;
  return param ? teks.replace(/\{(\w+)\}/g, (_, k) => (k in param ? String(param[k]) : `{${k}}`)) : teks;
}
