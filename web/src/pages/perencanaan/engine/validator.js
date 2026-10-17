/**
 * @file Validasi & sanitasi masukan. Dipakai formulir (umpan balik cepat) DAN sebelum
 * menulis ke Firestore. Security Rules tetap menjadi penjaga terakhir di server.
 * Kunci galat berupa KODE (bukan teks) agar mudah diterjemahkan lewat i18n.
 */

import { BATAS } from '../constants.js';
import { urai, selisihHari } from './tanggal.js';
import { normalisasiHari } from './rpe.js';
import { normKode } from './prota.js';

/** Buang karakter kontrol, rapikan spasi, potong ke panjang maksimum. */
export function bersihkanTeks(nilai, maks = BATAS.TEKS_SEDANG) {
  return String(nilai ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maks);
}

const bilanganOpsional = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
};

/**
 * Validasi + bersihkan konteks paket perencanaan.
 * @param {Record<string, any>} mentah
 * @returns {{ok:boolean, galat:Record<string,string>, nilai:Record<string,any>}}
 */
export function validasiKonteks(mentah) {
  const galat = {};
  const t = (k, maks = BATAS.TEKS_SEDANG) => bersihkanTeks(mentah[k], maks);

  const nilai = {
    mapel: t('mapel', BATAS.TEKS_PENDEK),
    kelas: t('kelas', 20),
    fase: t('fase', 4).toUpperCase(),
    tahunAjaran: t('tahunAjaran', 9),
    jpPerPekan: bilanganOpsional(mentah.jpPerPekan),
    totalJP: bilanganOpsional(mentah.totalJP),
    hariPembelajaran: normalisasiHari(mentah.hariPembelajaran),
    ganjil: { mulai: t('ganjilMulai', 10) || mentah.ganjil?.mulai || '', selesai: t('ganjilSelesai', 10) || mentah.ganjil?.selesai || '' },
    genap: { mulai: t('genapMulai', 10) || mentah.genap?.mulai || '', selesai: t('genapSelesai', 10) || mentah.genap?.selesai || '' },
    identitas: {
      sekolah: t('sekolah', BATAS.TEKS_PENDEK),
      guru: t('guru', BATAS.TEKS_PENDEK),
      nipGuru: t('nipGuru', 30),
      kepsek: t('kepsek', BATAS.TEKS_PENDEK),
      nipKepsek: t('nipKepsek', 30),
      lokasi: t('lokasi', BATAS.TEKS_PENDEK)
    },
    kalender: []
  };

  if (!nilai.mapel) galat.mapel = 'WAJIB';
  if (!nilai.kelas) galat.kelas = 'WAJIB';
  if (!/^[A-F]$/.test(nilai.fase)) galat.fase = 'FASE_TIDAK_VALID';
  if (!/^\d{4}\/\d{4}$/.test(nilai.tahunAjaran)) galat.tahunAjaran = 'FORMAT_TAHUN_AJARAN';
  else {
    const [a, b] = nilai.tahunAjaran.split('/').map(Number);
    if (b !== a + 1) galat.tahunAjaran = 'FORMAT_TAHUN_AJARAN';
  }

  if (!Number.isInteger(nilai.jpPerPekan) || nilai.jpPerPekan < BATAS.JP_PER_PEKAN_MIN || nilai.jpPerPekan > BATAS.JP_PER_PEKAN_MAX) {
    galat.jpPerPekan = 'JP_PER_PEKAN_DI_LUAR_BATAS';
  }
  if (nilai.totalJP !== null && (!Number.isInteger(nilai.totalJP) || nilai.totalJP < BATAS.TOTAL_JP_MIN || nilai.totalJP > BATAS.TOTAL_JP_MAX)) {
    galat.totalJP = 'TOTAL_JP_DI_LUAR_BATAS';
  }

  for (const sem of ['ganjil', 'genap']) {
    const a = urai(nilai[sem].mulai);
    const b = urai(nilai[sem].selesai);
    if (a === null) galat[`${sem}Mulai`] = 'TANGGAL_TIDAK_VALID';
    if (b === null) galat[`${sem}Selesai`] = 'TANGGAL_TIDAK_VALID';
    if (a !== null && b !== null) {
      if (b < a) galat[`${sem}Selesai`] = 'SELESAI_SEBELUM_MULAI';
      else if (selisihHari(a, b) > BATAS.RENTANG_SEMESTER_MAKS_HARI) galat[`${sem}Selesai`] = 'RENTANG_TERLALU_PANJANG';
    }
  }
  const gSel = urai(nilai.ganjil.selesai);
  const nMul = urai(nilai.genap.mulai);
  if (gSel !== null && nMul !== null && nMul <= gSel) galat.genapMulai = 'TUMPANG_TINDIH_SEMESTER';

  // Kalender: entri tidak valid dibuang dan dilaporkan sebagai galat agar guru memperbaikinya.
  const sumberKal = Array.isArray(mentah.kalender) ? mentah.kalender : [];
  if (sumberKal.length > BATAS.LIBUR_MAKS) galat.kalender = 'TERLALU_BANYAK_ENTRI';
  for (const e of sumberKal.slice(0, BATAS.LIBUR_MAKS)) {
    const a = urai(e?.mulai);
    const b = urai(e?.selesai || e?.mulai);
    if (a === null || b === null || b < a || selisihHari(a, b) > BATAS.RENTANG_LIBUR_MAKS_HARI) {
      galat.kalender = 'ENTRI_KALENDER_TIDAK_VALID';
      continue;
    }
    nilai.kalender.push({
      mulai: e.mulai,
      ...(e.selesai && e.selesai !== e.mulai ? { selesai: e.selesai } : {}),
      ket: bersihkanTeks(e.ket, BATAS.TEKS_PENDEK) || 'Libur',
      efektif: e.efektif === true
    });
  }

  return { ok: Object.keys(galat).length === 0, galat, nilai };
}

/**
 * Validasi struktur ATP (hasil AI maupun suntingan manual).
 * @param {any} atp
 * @returns {{ok:boolean, galat:string[]}}
 */
export function validasiAtp(atp) {
  const galat = [];
  if (!atp || !Array.isArray(atp.unit) || atp.unit.length === 0) return { ok: false, galat: ['ATP_TANPA_UNIT'] };
  if (atp.unit.length > BATAS.UNIT_MAKS) galat.push('UNIT_TERLALU_BANYAK');

  const kodeTerlihat = new Set();
  let jumlahTp = 0;
  atp.unit.forEach((u, i) => {
    if (!bersihkanTeks(u.nama)) galat.push(`UNIT_${i + 1}_TANPA_NAMA`);
    if (![1, 2].includes(u.semester)) galat.push(`UNIT_${i + 1}_SEMESTER_TIDAK_VALID`);
    if (!(u.tp ?? []).length) galat.push(`UNIT_${i + 1}_TANPA_TP`);
    (u.tp ?? []).forEach((t) => {
      jumlahTp++;
      const nk = normKode(t.kode);
      if (!nk) galat.push(`UNIT_${i + 1}_KODE_TP_KOSONG`);
      else if (kodeTerlihat.has(nk)) galat.push(`KODE_TP_GANDA:${t.kode}`);
      kodeTerlihat.add(nk);
      if (!bersihkanTeks(t.rumusan, 1200)) galat.push(`TP_${t.kode || '?'}_TANPA_RUMUSAN`);
      if (!Number.isInteger(t.jp) || t.jp < 1) galat.push(`TP_${t.kode || '?'}_JP_TIDAK_VALID`);
    });
  });
  if (jumlahTp === 0) galat.push('ATP_TANPA_TP');
  if (jumlahTp > BATAS.TP_MAKS) galat.push('TP_TERLALU_BANYAK');
  return { ok: galat.length === 0, galat };
}
