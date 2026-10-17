/**
 * @file Utilitas tanggal murni berbasis UTC.
 * Semua tanggal direpresentasikan sebagai string ISO "YYYY-MM-DD" (di penyimpanan)
 * dan milidetik UTC tengah malam (di perhitungan). Tidak bergantung zona waktu
 * peramban, sehingga hasil identik di server, laptop, dan HP.
 */

const HARI_MS = 86_400_000;
const POLA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** @param {number} n */
const dua = (n) => String(n).padStart(2, '0');

/**
 * Urai string ISO menjadi milidetik UTC; null bila tidak valid (termasuk 2026-02-30).
 * @param {unknown} iso
 * @returns {number|null}
 */
export function urai(iso) {
  const m = POLA_ISO.exec(String(iso ?? '').trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const dt = new Date(ms);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return ms;
}

/** @param {number} ms */
export function keIso(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${dua(d.getUTCMonth() + 1)}-${dua(d.getUTCDate())}`;
}

/** 0 = Minggu ... 6 = Sabtu. @param {number} ms */
export const hariDalamPekan = (ms) => new Date(ms).getUTCDay();

/** Senin pada pekan yang memuat `ms` (pekan dimulai Senin). @param {number} ms */
export function seninPekan(ms) {
  const w = hariDalamPekan(ms);
  return ms + (w === 0 ? -6 : 1 - w) * HARI_MS;
}

/** @param {number} ms @param {number} n */
export const tambahHari = (ms, n) => ms + n * HARI_MS;

/** Selisih hari (b - a), bilangan bulat. */
export const selisihHari = (a, b) => Math.round((b - a) / HARI_MS);

/** Nomor bulan 1..12 dari ISO. @param {string} iso */
export function bulanDariIso(iso) {
  const ms = urai(iso);
  return ms === null ? 0 : new Date(ms).getUTCMonth() + 1;
}

/**
 * Format tanggal untuk tampilan, selalu dalam UTC agar tidak bergeser sehari.
 * @param {string} iso
 * @param {string} [locale]
 * @param {Intl.DateTimeFormatOptions} [opsi]
 */
export function formatTanggal(iso, locale = 'id-ID', opsi = { day: 'numeric', month: 'long', year: 'numeric' }) {
  const ms = urai(iso);
  if (ms === null) return '';
  return new Intl.DateTimeFormat(locale, { ...opsi, timeZone: 'UTC' }).format(new Date(ms));
}

/** Nama bulan panjang. @param {number} nomor 1..12 @param {string} [locale] */
export function namaBulan(nomor, locale = 'id-ID') {
  return new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, nomor - 1, 1)));
}

/** Nama hari panjang dari ISO. @param {string} iso @param {string} [locale] */
export function namaHari(iso, locale = 'id-ID') {
  const ms = urai(iso);
  return ms === null ? '' : new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(new Date(ms));
}

/** Iterasi tanggal inklusif [mulai, selesai]. */
export function* rentang(mulaiMs, selesaiMs) {
  for (let t = mulaiMs; t <= selesaiMs; t += HARI_MS) yield t;
}
