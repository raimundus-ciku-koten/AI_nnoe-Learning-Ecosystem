/**
 * format.js — Helper formatting umum.
 * Menggantikan: BULAN_ID_FP_ + tanggalIndonesiaFp_() + fmtAngkaProta_() dari GAS lama.
 */

const BULAN_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const HARI_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/** 2026-10-12 → "12 Oktober 2026" */
export function tanggalPanjang(value) {
  const d = toDate(value);
  if (!d) return '-';
  return `${d.getDate()} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
}

/** 2026-10-12 → "12 Okt 2026" */
export function tanggalPendek(value) {
  const d = toDate(value);
  if (!d) return '-';
  return `${d.getDate()} ${BULAN_ID[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
}

/** 2026-10-12 → "Senin, 12 Okt" */
export function tanggalHari(value) {
  const d = toDate(value);
  if (!d) return '-';
  return `${HARI_ID[d.getDay()]}, ${d.getDate()} ${BULAN_ID[d.getMonth()].slice(0, 3)}`;
}

/** Relatif: "2 jam lalu", "kemarin", "12 Okt" */
export function waktuRelatif(value) {
  const d = toDate(value);
  if (!d) return '-';
  const diff = Date.now() - d.getTime();
  const detik = Math.floor(diff / 1000);
  if (detik < 60) return 'Baru saja';
  if (detik < 3600) return `${Math.floor(detik / 60)} menit lalu`;
  if (detik < 86400) return `${Math.floor(detik / 3600)} jam lalu`;
  if (detik < 172800) return 'Kemarin';
  if (detik < 604800) return `${Math.floor(detik / 86400)} hari lalu`;
  return tanggalPendek(d);
}

/** 1234 → "1.234" */
export function angkaRibuan(n) {
  const x = parseInt(n, 10) || 0;
  return String(x).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** "Ainnoe Learning Ecosystem" → "Ainnoe_Learning_Ecosystem" (untuk nama berkas) */
export function slugify(str) {
  return String(str || '')
    .replace(/[\/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 60)
    .trim();
}

/**
 * Firestore Timestamp | Date | string | number → Date
 */
export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate(); // Firestore Timestamp
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}