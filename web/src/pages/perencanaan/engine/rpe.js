/**
 * @file Mesin Rincian Pekan Efektif (RPE) — murni, deterministik, tanpa AI.
 * Port dari 08f_GenerateRpe.gs (hitungPekanEfektifDariKalenderRpe_, susunHitungRpe_)
 * dengan perbedaan sengaja:
 *   - keluaran STRUKTUR DATA (bukan HTML); teks keterangan dirakit di lapisan tampilan
 *     sehingga siap i18n dan bebas risiko XSS;
 *   - tanggal memakai UTC murni (lihat tanggal.js);
 *   - kalender libur divalidasi dan dibatasi ukurannya.
 */

import { BATAS, INDEKS_HARI } from '../constants.js';
import { urai, keIso, seninPekan, tambahHari, rentang, selisihHari } from './tanggal.js';

/**
 * @typedef {Object} EntriKalender
 * @property {string} mulai  ISO
 * @property {string} [selesai] ISO (bila kosong = satu hari)
 * @property {string} ket
 * @property {boolean} efektif  false = hari tidak efektif (libur, ujian sekolah, dsb.)
 */

/**
 * @typedef {Object} Pekan
 * @property {number} noSemester
 * @property {string} mulai ISO hari pembelajaran pertama pada pekan itu
 * @property {string} selesai ISO hari pembelajaran terakhir pada pekan itu
 * @property {boolean} efektif
 * @property {number} jp
 * @property {string[]} hariPembelajaran
 * @property {number} hariEfektif
 * @property {{tanggal:string, ket:string}[]} hariTidakEfektif
 * @property {'efektif'|'sebagian'|'nonEfektif'} status
 */

/**
 * Normalkan masukan hari belajar menjadi indeks 1..6 terurut tanpa duplikat.
 * Menerima: jumlah hari (1-6), larik angka, larik/teks nama hari ("Senin, Rabu").
 * Pola jumlah hari mengikuti GAS: 1→Sen; 2→Sen,Kam; 3→Sen,Rab,Jum; n≥4→Sen..n.
 * @param {unknown} sumber
 * @returns {number[]}
 */
export function normalisasiHari(sumber) {
  const hasil = new Set();
  const taruh = (k) => {
    const n = Number(k);
    if (Number.isInteger(n) && n >= 1 && n <= 6) hasil.add(n);
  };
  const polaJumlah = (n) => {
    const x = Math.min(6, Math.max(1, n));
    if (x === 1) return [1];
    if (x === 2) return [1, 4];
    if (x === 3) return [1, 3, 5];
    return Array.from({ length: x }, (_, i) => i + 1);
  };
  const dariTeks = (teks) => {
    String(teks).split(/[,;/|]+/).forEach((bag) => {
      const kunci = bag.trim().toLowerCase().replace(/[.']/g, '');
      if (kunci in INDEKS_HARI) taruh(INDEKS_HARI[kunci]);
      else if (/^\d$/.test(kunci)) taruh(kunci);
    });
  };

  if (Array.isArray(sumber)) {
    sumber.forEach((x) => (typeof x === 'number' ? taruh(x) : dariTeks(x)));
  } else if (typeof sumber === 'number' && Number.isFinite(sumber)) {
    polaJumlah(Math.trunc(sumber)).forEach(taruh);
  } else if (typeof sumber === 'string' && sumber.trim()) {
    if (/^\d+$/.test(sumber.trim())) polaJumlah(parseInt(sumber, 10)).forEach(taruh);
    else dariTeks(sumber);
  }
  if (hasil.size === 0) polaJumlah(5).forEach(taruh);
  return [...hasil].sort((a, b) => a - b);
}

function distribusikanJp(jumlahHari, totalJP) {
  if (jumlahHari < 1) return [];
  const total = Math.max(0, Math.trunc(Number(totalJP)) || 0);
  const dasar = Math.floor(total / jumlahHari);
  let sisa = total % jumlahHari;
  return Array.from({ length: jumlahHari }, () => dasar + (sisa-- > 0 ? 1 : 0));
}

/**
 * Bangun peta tanggal → entri dari daftar kalender. Hari tidak efektif MENGUNGGULI efektif
 * (bila dua entri jatuh di tanggal yang sama), sama seperti masukPetaKalenderRpe_ di GAS.
 * @param {EntriKalender[]} kalender
 * @returns {Map<string,{ket:string,efektif:boolean}>}
 */
export function bangunPetaKalender(kalender) {
  /** @type {Map<string,{ket:string,efektif:boolean}>} */
  const peta = new Map();
  for (const e of (kalender ?? []).slice(0, BATAS.LIBUR_MAKS)) {
    const a = urai(e?.mulai);
    const b = urai(e?.selesai || e?.mulai);
    if (a === null || b === null) continue;
    const [awal, akhir] = a <= b ? [a, b] : [b, a];
    if (selisihHari(awal, akhir) > BATAS.RENTANG_LIBUR_MAKS_HARI) continue;
    const ket = String(e.ket ?? '').trim().slice(0, BATAS.TEKS_PENDEK);
    const efektif = e.efektif === true;
    for (const t of rentang(awal, akhir)) {
      const iso = keIso(t);
      const ada = peta.get(iso);
      if (!ada || (ada.efektif && !efektif)) peta.set(iso, { ket, efektif });
    }
  }
  return peta;
}

/**
 * Hitung pekan-pekan dalam satu semester.
 * @param {Object} p
 * @param {string} p.mulai
 * @param {string} p.selesai
 * @param {number[]} p.hari indeks 1..6
 * @param {Record<number, number>} p.jpPerHari
 * @param {Map<string,{ket:string,efektif:boolean}>} p.peta
 * @returns {Pekan[]}
 */
export function hitungPekanSemester({ mulai, selesai, hari, jpPerHari, peta }) {
  let a = urai(mulai);
  let b = urai(selesai);
  if (a === null || b === null || hari.length === 0) return [];
  if (a > b) [a, b] = [b, a];

  const hasil = [];
  let no = 0;
  for (let senin = seninPekan(a); senin <= b; senin = tambahHari(senin, 7)) {
    if (tambahHari(senin, 6) < a) continue;

    const hariPekan = [];
    const tidak = [];
    let efektifCount = 0;
    let jpEfektif = 0;
    for (const k of hari) {
      const t = tambahHari(senin, k - 1);
      if (t < a || t > b) continue;
      const iso = keIso(t);
      hariPekan.push(iso);
      const jpHari = jpPerHari[k] ?? 0;
      if (jpHari === 0) continue;
      const entri = peta.get(iso);
      if (entri && !entri.efektif) tidak.push({ tanggal: iso, ket: entri.ket || '' });
      else {
        efektifCount++;
        jpEfektif += jpHari;
      }
    }
    if (hariPekan.length === 0) continue;

    no++;
    const efektif = efektifCount > 0;
    hasil.push({
      noSemester: no,
      mulai: hariPekan[0],
      selesai: hariPekan[hariPekan.length - 1],
      efektif,
      jp: jpEfektif,
      hariPembelajaran: hariPekan,
      hariEfektif: efektifCount,
      hariTidakEfektif: tidak,
      status: !efektif ? 'nonEfektif' : tidak.length ? 'sebagian' : 'efektif'
    });
  }
  return hasil;
}

/** @param {Pekan[]} pekan */
export function rekapPekan(pekan) {
  const efektif = pekan.filter((p) => p.efektif).length;
  return {
    totalPekan: pekan.length,
    efektif,
    nonEfektif: pekan.length - efektif,
    totalJP: pekan.reduce((total, item) => total + item.jp, 0)
  };
}

/**
 * Hitung RPE lengkap untuk satu paket perencanaan.
 * @param {Object} k konteks paket
 * @param {number} k.jpPerPekan
 * @param {unknown} k.hariPembelajaran
 * @param {Record<number, number>} [k.jpPerHari]
 * @param {{mulai:string,selesai:string}} k.ganjil
 * @param {{mulai:string,selesai:string}} k.genap
 * @param {EntriKalender[]} [k.kalender]
 * @param {number|null} [k.totalJP] bila diisi guru, menjadi acuan resmi (Prota/ATP)
 */
export function hitungRpe(k) {
  const hari = normalisasiHari(k.hariPembelajaran);
  const jpTerdistribusi = distribusikanJp(hari.length, k.jpPerPekan);
  const jpPerHari = Object.fromEntries(hari.map((hariKe, index) => {
    const nilaiBaru = k.jpPerHari?.[hariKe];
    const nilai = Number.isInteger(nilaiBaru) && nilaiBaru >= 0
      ? nilaiBaru
      : jpTerdistribusi[index];
    return [hariKe, nilai];
  }));
  const jpPerPekan = Object.values(jpPerHari).reduce((total, nilai) => total + nilai, 0);
  const peta = bangunPetaKalender(k.kalender);

  const pekanGanjil = hitungPekanSemester({ ...k.ganjil, hari, jpPerHari, peta });
  const pekanGenap = hitungPekanSemester({ ...k.genap, hari, jpPerHari, peta });
  const ganjil = rekapPekan(pekanGanjil);
  const genap = rekapPekan(pekanGenap);

  const totalHitung = ganjil.totalJP + genap.totalJP;
  const totalResmi = Number.isInteger(k.totalJP) && k.totalJP >= BATAS.TOTAL_JP_MIN ? k.totalJP : null;

  return {
    jpPerPekan,
    jpPerHari,
    hari,
    ganjil: { ...k.ganjil, pekan: pekanGanjil, rekap: ganjil },
    genap: { ...k.genap, pekan: pekanGenap, rekap: genap },
    totalJPHitung: totalHitung,
    /** Acuan tunggal untuk dokumen turunan: nilai resmi guru bila ada, jika tidak hasil hitung. */
    totalJP: totalResmi ?? totalHitung,
    selisihDenganResmi: totalResmi === null ? 0 : totalResmi - totalHitung
  };
}
