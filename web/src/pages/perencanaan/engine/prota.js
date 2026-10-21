/**
 * @file Mesin ATP (normalisasi) dan Program Tahunan (Prota) — murni & deterministik.
 * Port dari 08c_GenerateProta.gs v7. Prinsip tetap sama:
 *   Total JP resmi adalah KEBENARAN TUNGGAL;  Σ JP TP + Σ JP Ulangan Harian = Total JP (tepat).
 * Rekap ATP (Bagian 5 & 6) diturunkan dari fungsi yang sama dengan Prota, sehingga
 * keduanya tidak mungkin berselisih.
 */

import { BATAS } from '../constants.js';

/**
 * @typedef {Object} TpAtp
 * @property {string} kode
 * @property {string} rumusan
 * @property {string} materi
 * @property {number} jp
 *
 * @typedef {Object} UnitAtp
 * @property {number} no
 * @property {string} nama
 * @property {string} elemen
 * @property {1|2} semester
 * @property {TpAtp[]} tp
 *
 * @typedef {Object} Atp
 * @property {{elemen:string, cp:string}[]} cp
 * @property {UnitAtp[]} unit
 */

/** Normalkan kode TP untuk pencocokan. @param {unknown} k */
export const normKode = (k) => String(k ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Bagi `total` (bilangan bulat) menurut bobot memakai metode sisa terbesar.
 * Jumlah hasil SELALU persis `total`. Bila `minimum` > 0 dan cukup, tiap bagian ≥ minimum.
 * @param {number[]} bobot
 * @param {number} total
 * @param {number} [minimum]
 * @returns {number[]}
 */
export function bagiProporsional(bobot, total, minimum = 0) {
  const n = bobot.length;
  if (n === 0) return [];
  const jumlah = bobot.reduce((s, b) => s + Math.max(0, b || 0), 0);
  const mn = minimum > 0 && total >= n * minimum ? minimum : 0;
  const sisa = total - mn * n;
  const mentah = bobot.map((b) => (jumlah > 0 ? Math.max(0, b || 0) / jumlah : 1 / n) * sisa);
  const lantai = mentah.map(Math.floor);
  const urutan = mentah
    .map((_, i) => i)
    .sort((x, y) => (mentah[y] - lantai[y]) - (mentah[x] - lantai[x]) || x - y);
  const hasil = lantai.map((v) => mn + v);
  let kurang = sisa - lantai.reduce((s, v) => s + v, 0);
  for (let i = 0; kurang > 0; i++, kurang--) hasil[urutan[i % n]]++;
  return hasil;
}

/** Ratakan ATP menjadi daftar TP datar (urut unit lalu TP). @param {Atp} atp */
export function ratakanTp(atp) {
  const hasil = [];
  for (const u of atp?.unit ?? []) {
    for (const t of u.tp ?? []) {
      hasil.push({
        kode: t.kode, rumusan: t.rumusan, materi: t.materi, jp: t.jp,
        unit: u.nama, noUnit: u.no, elemen: u.elemen, semester: u.semester
      });
    }
  }
  return hasil;
}

/**
 * Ambil CP dan TP kanonis dari ATP untuk ditampilkan tanpa parafrasa pada Modul Ajar.
 * @param {Atp} atp
 * @param {UnitAtp} unit
 */
export function sumberBelajarModul(atp, unit, prota, prosem) {
  const elemen = unit?.elemen;
  const program = prota?.program?.[unit?.semester];
  const alokasi = program?.modul?.find((item) => item.no === unit?.no);
  const jadwal = [];
  for (const semester of [1, 2]) {
    for (const bulan of prosem?.[semester === 1 ? 'ganjil' : 'genap']?.bulan ?? []) {
      for (const pekan of bulan.pekan ?? []) {
        const segmen = (pekan.segmen ?? []).filter((item) => item.modulNo === unit?.no);
        if (!segmen.length) continue;
        jadwal.push({
          semester,
          pekan: pekan.noSemester,
          mulai: pekan.mulai,
          selesai: pekan.selesai,
          jp: segmen.reduce((total, item) => total + item.jp, 0)
        });
      }
    }
  }
  return {
    cp: (atp?.cp ?? []).filter((item) => item.elemen === elemen),
    tp: (unit?.tp ?? []).map(({ kode, rumusan, materi }) => ({ kode, rumusan, materi })),
    alokasi: alokasi ? {
      semester: unit.semester,
      jp: alokasi.jp,
      jpTP: alokasi.jpTP,
      uh: alokasi.uh
    } : null,
    jadwal
  };
}

/**
 * Anggaran waktu: berapa JP ulangan harian per unit dan sisa untuk TP.
 * @param {number} jumlahUnit
 * @param {number} totalJP
 * @param {number} jpPerPekan
 * @param {number} jumlahHari hari pembelajaran per pekan
 * @returns {{ok:true, jpPertemuan:number, uhTotal:number, sisaTP:number}|{ok:false, alasan:string}}
 */
export function hitungAnggaran(jumlahUnit, totalJP, jpPerPekan, jumlahHari) {
  if (!(totalJP >= BATAS.TOTAL_JP_MIN)) return { ok: false, alasan: 'TOTAL_JP_TERLALU_KECIL' };
  if (jumlahUnit < 1) return { ok: false, alasan: 'TIDAK_ADA_UNIT' };
  const hari = Math.max(1, jumlahHari || 1);
  let jpPertemuan = Math.max(1, Math.round((jpPerPekan || 2) / hari));
  while (jpPertemuan > 1 && jpPertemuan * jumlahUnit > totalJP / 3) jpPertemuan--;
  const uhTotal = jpPertemuan * jumlahUnit;
  const sisaTP = totalJP - uhTotal;
  if (sisaTP < jumlahUnit) return { ok: false, alasan: 'JP_TIDAK_CUKUP' };
  return { ok: true, jpPertemuan, uhTotal, sisaTP };
}

/**
 * Sesuaikan JP tiap TP pada ATP agar Σ JP TP = Total JP − Σ UH (tepat), tanpa mengubah
 * kode, rumusan, materi, unit, atau semester. Mengembalikan salinan baru (tidak memutasi).
 * @param {Atp} atp
 * @param {number} totalJP
 * @param {number} jpPerPekan
 * @param {number} jumlahHari
 * @returns {{ok:true, atp:Atp, anggaran:Object}|{ok:false, alasan:string}}
 */
export function selaraskanJpAtp(atp, totalJP, jpPerPekan, jumlahHari) {
  const unit = (atp?.unit ?? []).filter((u) => (u.tp ?? []).length > 0);
  const ang = hitungAnggaran(unit.length, totalJP, jpPerPekan, jumlahHari);
  if (!ang.ok) return ang;

  const bobotUnit = unit.map((u) => u.tp.reduce((s, t) => s + (t.jp > 0 ? t.jp : 0), 0));
  const jpUnit = bagiProporsional(bobotUnit, ang.sisaTP, 1);
  const unitBaru = unit.map((u, i) => {
    const jpTp = bagiProporsional(u.tp.map((t) => t.jp), jpUnit[i], 1);
    return { ...u, tp: u.tp.map((t, k) => ({ ...t, jp: jpTp[k] })) };
  });
  return { ok: true, atp: { ...atp, unit: unitBaru }, anggaran: ang };
}

/**
 * Rekap alokasi waktu tahunan dari ATP yang sudah selaras (dipakai Bagian 5 & 6 ATP).
 * @param {Atp} atp
 * @param {number} jpPertemuan JP ulangan harian per unit
 */
export function rekapAtp(atp, jpPertemuan) {
  const per = { 1: { jpTP: 0, uh: 0 }, 2: { jpTP: 0, uh: 0 } };
  for (const u of atp.unit) {
    if (!u.tp?.length) continue;
    const s = u.semester === 2 ? 2 : 1;
    per[s].jpTP += u.tp.reduce((x, t) => x + t.jp, 0);
    per[s].uh += jpPertemuan;
  }
  return {
    ganjil: { ...per[1], subtotal: per[1].jpTP + per[1].uh },
    genap: { ...per[2], subtotal: per[2].jpTP + per[2].uh },
    total: per[1].jpTP + per[1].uh + per[2].jpTP + per[2].uh
  };
}

/** Teks pekan ke- dari JP kumulatif. */
function rentangPekan(kum, jp, jpPerPekan) {
  if (!(jp > 0) || !(jpPerPekan > 0)) return null;
  const a = Math.floor(kum / jpPerPekan) + 1;
  const b = Math.max(a, Math.ceil((kum + jp) / jpPerPekan));
  return { dari: a, sampai: b };
}

/**
 * Tentukan semester tiap unit: ikuti ATP bila konsisten (tidak turun, kedua semester terpakai),
 * jika tidak belah menurut JP kumulatif pada batas unit utuh.
 */
function tentukanSemester(unit, jpUnit, jpPertemuan, totalJP) {
  const n = unit.length;
  let sem = unit.map((u) => (u.semester === 2 ? 2 : u.semester === 1 ? 1 : 0));
  let konsisten = sem.every((x) => x > 0);
  for (let i = 1; konsisten && i < n; i++) if (sem[i] < sem[i - 1]) konsisten = false;
  if (konsisten && n > 1 && sem[0] === sem[n - 1]) konsisten = false;
  if (konsisten) return sem;

  sem = [];
  let kum = 0;
  for (let j = 0; j < n; j++) {
    const isi = jpUnit[j] + jpPertemuan;
    sem[j] = kum + isi / 2 <= totalJP / 2 ? 1 : 2;
    kum += isi;
  }
  if (n > 1) {
    if (sem[n - 1] === 1) sem[n - 1] = 2;
    if (sem[0] === 2) sem[0] = 1;
  } else sem[0] = 1;
  return sem;
}

/**
 * Hitung Program Tahunan.
 * @param {Object} p
 * @param {Atp} p.atp
 * @param {number} p.totalJP
 * @param {number} p.jpPerPekan
 * @param {number} p.jumlahHari
 */
export function hitungProta({ atp, totalJP, jpPerPekan, jumlahHari }) {
  const unit = (atp?.unit ?? []).filter((u) => (u.tp ?? []).length > 0);
  const ang = hitungAnggaran(unit.length, totalJP, jpPerPekan, jumlahHari);
  if (!ang.ok) return ang;

  const bobotUnit = unit.map((u) => u.tp.reduce((s, t) => s + (t.jp > 0 ? t.jp : 0), 0));
  const jpUnit = bagiProporsional(bobotUnit, ang.sisaTP, 1);
  const semUnit = tentukanSemester(unit, jpUnit, ang.jpPertemuan, totalJP);

  const program = {
    1: { modul: [], jpTP: 0, uh: 0, jp: 0 },
    2: { modul: [], jpTP: 0, uh: 0, jp: 0 }
  };
  const kum = { 1: 0, 2: 0 };

  unit.forEach((u, idx) => {
    const no = idx + 1;
    const s = semUnit[idx];
    const jpTp = bagiProporsional(u.tp.map((t) => t.jp), jpUnit[idx], 1);
    const baris = u.tp.map((t, k) => {
      const r = rentangPekan(kum[s], jpTp[k], jpPerPekan);
      kum[s] += jpTp[k];
      return {
        kode: t.kode, rumusan: t.rumusan, materi: t.materi, jp: jpTp[k],
        pekan: r, semester: s
      };
    });
    const uhPekan = rentangPekan(kum[s], ang.jpPertemuan, jpPerPekan);
    kum[s] += ang.jpPertemuan;

    const P = program[s];
    P.modul.push({
      no, nama: u.nama || `Modul ${no}`, elemen: u.elemen,
      jpTP: jpUnit[idx], uh: ang.jpPertemuan, uhPekan, baris
    });
    P.jpTP += jpUnit[idx];
    P.uh += ang.jpPertemuan;
    P.jp += jpUnit[idx] + ang.jpPertemuan;
  });

  return {
    ok: true,
    totalJP,
    jpPerPekan,
    jpPertemuan: ang.jpPertemuan,
    uhTotal: ang.uhTotal,
    jpTP: ang.sisaTP,
    jumlahModul: unit.length,
    program
  };
}
