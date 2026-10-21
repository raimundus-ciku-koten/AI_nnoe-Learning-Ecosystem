/**
 * @file Pemformat tampilan (tanggal, rentang, pekan). Bergantung pada lokal aktif i18n.
 */

import { formatTanggal, namaBulan, namaHari } from '../../engine/tanggal.js';
import { lokal, t } from '../../i18n/index.js';

const SINGKAT = { day: 'numeric', month: 'short' };
const PENUH = { day: 'numeric', month: 'short', year: 'numeric' };

/** "13 Jul – 17 Jul 2026" (tahun hanya di akhir bila sama). */
export function rentangTanggal(mulai, selesai) {
  if (!mulai) return '';
  if (!selesai || selesai === mulai) return formatTanggal(mulai, lokal(), PENUH);
  const sama = mulai.slice(0, 4) === selesai.slice(0, 4);
  return `${formatTanggal(mulai, lokal(), sama ? SINGKAT : PENUH)} – ${formatTanggal(selesai, lokal(), PENUH)}`;
}

export const tanggalPanjang = (iso) => formatTanggal(iso, lokal());
export const bulanNama = (n) => namaBulan(n, lokal());
export const hariNama = (iso) => namaHari(iso, lokal());

/** "5" atau "5–7" dari {dari, sampai}; "–" bila tidak ada. */
export function teksPekan(r) {
  if (!r) return '–';
  return r.dari === r.sampai ? String(r.dari) : `${r.dari}–${r.sampai}`;
}

/** Keterangan sebuah pekan RPE (disusun di sini agar mudah diterjemahkan). */
export function keteranganPekan(p) {
  if (p.status === 'efektif') return t('rpe.ket.efektif');
  const rinci = p.hariTidakEfektif.map((x) =>
    `${hariNama(x.tanggal)} ${formatTanggal(x.tanggal, lokal(), SINGKAT)}${x.ket ? ` (${x.ket})` : ''}`);
  if (p.status === 'sebagian') return t('rpe.ket.sebagian', { rinci: rinci.join('; ') });
  const alasan = [...new Set(p.hariTidakEfektif.map((x) => x.ket).filter(Boolean))];
  return alasan.join('; ') || t('rpe.ket.nonEfektif');
}
