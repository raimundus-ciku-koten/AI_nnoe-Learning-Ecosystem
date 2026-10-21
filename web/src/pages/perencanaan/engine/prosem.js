/**
 * @file Mesin Program Semester (Prosem) — murni & deterministik.
 *
 * Menempatkan urutan kegiatan Prota (TP lalu Ulangan Harian per modul) ke pekan-pekan
 * efektif hasil RPE, memakai kapasitas `jpPerPekan` per pekan efektif. Pekan tidak efektif
 * (libur/ujian sekolah) ikut ditampilkan dengan alasannya sehingga guru melihat kalender utuh.
 *
 * Keputusan desain (berbeda dari GAS, yang meminta AI menyusun matriks):
 *  - Tidak ada AI → tidak ada matriks terpotong atau JP yang meleset.
 *  - Sumatif Tengah Semester (STS) ditandai pada pekan efektif ke-⌈E/2⌉ dan Sumatif Akhir
 *    Semester (SAS) pada pekan efektif terakhir. Keduanya PENANDA waktu pelaksanaan; JP-nya
 *    tidak ditambahkan di luar Total JP resmi (konsisten dengan Prota di GAS).
 *  - Bila kapasitas pekan efektif melebihi JP Prota, sisa pekan ditandai "cadangan"
 *    (remedial/pengayaan). Bila kurang, selisihnya dilaporkan di `kekuranganJP`.
 */

import { bulanDariIso, urai } from './tanggal.js';

/**
 * @typedef {Object} SegmenProsem
 * @property {'tp'|'uh'} jenis
 * @property {number} modulNo
 * @property {string} [kode]
 * @property {string} [materi]
 * @property {number} jp
 */

/**
 * @param {Object} p
 * @param {{pekan:import('./rpe.js').Pekan[]}} p.rpeSemester
 * @param {{modul:any[]}} p.protaSemester
 * @param {number} p.jpPerPekan
 */
export function hitungProsemSemester({ rpeSemester, protaSemester, jpPerPekan }) {
  /** @type {SegmenProsem[]} */
  const urutan = [];
  for (const m of protaSemester?.modul ?? []) {
    for (const b of m.baris) urutan.push({ jenis: 'tp', modulNo: m.no, kode: b.kode, materi: b.materi, jp: b.jp });
    urutan.push({ jenis: 'uh', modulNo: m.no, jp: m.uh });
  }

  const pekan = (rpeSemester?.pekan ?? []).map((p) => ({
    noSemester: p.noSemester,
    mulai: p.mulai,
    selesai: p.selesai,
    bulan: bulanDariIso(p.mulai),
    tahun: (() => { const ms = urai(p.mulai); return ms === null ? 0 : new Date(ms).getUTCFullYear(); })(),
    efektif: p.efektif,
    status: p.status,
    hariTidakEfektif: p.hariTidakEfektif,
    /** @type {SegmenProsem[]} */
    segmen: [],
    /** @type {'sts'|'sas'|'cadangan'|null} */
    penanda: null
  }));

  const efektif = pekan.filter((p) => p.efektif);
  let kekuranganJP = 0;

  // Tempatkan segmen ke pekan efektif berurutan.
  let ix = 0;
  let sisaPekan = jpPerPekan;
  for (const item of urutan) {
    let sisa = item.jp;
    while (sisa > 0) {
      if (ix >= efektif.length) { kekuranganJP += sisa; break; }
      const ambil = Math.min(sisa, sisaPekan);
      efektif[ix].segmen.push({ ...item, jp: ambil });
      sisa -= ambil;
      sisaPekan -= ambil;
      if (sisaPekan === 0) { ix++; sisaPekan = jpPerPekan; }
    }
  }

  // Pekan efektif tanpa segmen sama sekali → cadangan.
  for (const p of efektif) if (p.segmen.length === 0) p.penanda = 'cadangan';

  // Penanda sumatif (tidak menimpa 'cadangan' yang bukan akhir semester).
  const e = efektif.length;
  if (e >= 2) efektif[Math.ceil(e / 2) - 1].penanda = 'sts';
  if (e >= 1) efektif[e - 1].penanda = 'sas';

  // Kelompokkan per bulan (berurutan sesuai kemunculan).
  /** @type {{bulan:number, tahun:number, pekan:typeof pekan}[]} */
  const bulan = [];
  for (const p of pekan) {
    const akhir = bulan[bulan.length - 1];
    if (akhir && akhir.bulan === p.bulan && akhir.tahun === p.tahun) akhir.pekan.push(p);
    else bulan.push({ bulan: p.bulan, tahun: p.tahun, pekan: [p] });
  }

  return {
    bulan,
    pekanEfektif: e,
    jpTerjadwal: urutan.reduce((s, i) => s + i.jp, 0) - kekuranganJP,
    kekuranganJP,
    kapasitasJP: e * jpPerPekan
  };
}

/**
 * Hitung Prosem untuk kedua semester.
 * @param {{rpe:any, prota:any}} p  `rpe` = keluaran hitungRpe, `prota` = keluaran hitungProta (ok)
 */
export function hitungProsem({ rpe, prota }) {
  return {
    jpPerPekan: rpe.jpPerPekan,
    ganjil: hitungProsemSemester({ rpeSemester: rpe.ganjil, protaSemester: prota.program[1], jpPerPekan: rpe.jpPerPekan }),
    genap: hitungProsemSemester({ rpeSemester: rpe.genap, protaSemester: prota.program[2], jpPerPekan: rpe.jpPerPekan })
  };
}
