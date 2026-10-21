/**
 * @file Renderer Prota dan Prosem.
 */

import { h, tabel, angka } from '../dom.js';
import { t } from '../../i18n/index.js';
import { kopDokumen, tabelIdentitas, blokTtd, peringatan } from './umum.js';
import { teksPekan, rentangTanggal, bulanNama, keteranganPekan } from './format.js';

/* -------------------------------- Prota -------------------------------- */

function tabelProtaSemester(nama, sem) {
  const baris = [];
  for (const m of sem.modul) {
    m.baris.forEach((b, i) => {
      baris.push([
        i === 0 ? { teks: `${t('atp.modul')} ${m.no}: ${m.nama}`, rowspan: m.baris.length + 1, kelas: 'sel-unit' } : null,
        b.kode, b.rumusan, b.materi, String(b.jp), teksPekan(b.pekan)
      ].filter((x) => x !== null));
    });
    baris.push([{ teks: t('prota.ulanganHarian', { no: m.no }), colspan: 3, kelas: 'miring' }, String(m.uh), teksPekan(m.uhPekan)]);
  }
  baris.push([{ teks: t('prota.jumlahSemester', { semester: nama }), colspan: 4, kelas: 'tebal' },
    { teks: angka(sem.jp), kelas: 'tebal' }, '']);
  return tabel({
    caption: t('prota.tabelSemester', { semester: nama }),
    kelas: 'tbl-prota',
    kepala: [t('atp.modul'), t('atp.kode'), t('atp.tp'), t('atp.materi'), t('atp.jp'), t('prota.pekan')],
    baris
  });
}

/** @param {Object} prota payload hitungRpe→hitungProta (ok) @param {Object} konteks */
export function renderProta(prota, konteks) {
  return h('article', { class: 'dokumen dokumen-prota' },
    kopDokumen(konteks, t('prota.judul')),
    tabelIdentitas(konteks, [
      [t('atp.totalJP'), `${angka(prota.totalJP)} JP`],
      [t('prota.jpTp'), `${angka(prota.jpTP)} JP`],
      [t('prota.jpUh'), `${angka(prota.uhTotal)} JP (${prota.jumlahModul} × ${prota.jpPertemuan} JP)`]
    ]),
    h('section', null, h('h2', null, t('prota.bagianSemester', { semester: t('umum.ganjil') })), tabelProtaSemester(t('umum.ganjil'), prota.program[1])),
    h('section', null, h('h2', null, t('prota.bagianSemester', { semester: t('umum.genap') })), tabelProtaSemester(t('umum.genap'), prota.program[2])),
    h('p', { class: 'rumus' }, t('prota.rumus', { tp: angka(prota.jpTP), uh: angka(prota.uhTotal), total: angka(prota.totalJP) })),
    blokTtd(konteks));
}

/* -------------------------------- Prosem -------------------------------- */

function kegiatanSegmen(seg) {
  return seg.map((s) => (s.jenis === 'uh'
    ? t('prosem.uh', { no: s.modulNo })
    : `${s.kode} (${s.jp} JP)`)).join('; ');
}

function modulSegmen(seg) {
  return [...new Set(seg.map((s) => s.modulNo))].join(', ');
}

function keteranganProsem(p) {
  const bagian = [];
  if (p.penanda === 'sts') bagian.push(t('prosem.sts'));
  if (p.penanda === 'sas') bagian.push(t('prosem.sas'));
  if (p.penanda === 'cadangan') bagian.push(t('prosem.cadangan'));
  if (!p.efektif) bagian.push(keteranganPekan(p));
  else if (p.status === 'sebagian') bagian.push(keteranganPekan(p));
  return bagian.join(' · ');
}

function tabelProsemSemester(nama, sem) {
  const baris = [];
  for (const b of sem.bulan) {
    b.pekan.forEach((p, i) => {
      const r = [
        i === 0 ? { teks: `${bulanNama(b.bulan)} ${b.tahun}`, rowspan: b.pekan.length, kelas: 'sel-unit' } : null,
        String(p.noSemester),
        rentangTanggal(p.mulai, p.selesai),
        p.efektif ? modulSegmen(p.segmen) || '–' : '–',
        p.efektif ? kegiatanSegmen(p.segmen) || '–' : '–',
        p.efektif ? String(p.segmen.reduce((s, x) => s + x.jp, 0)) : '0',
        keteranganProsem(p)
      ].filter((x) => x !== null);
      r.kelas = !p.efektif ? 'baris-nonefektif' : p.penanda === 'sts' || p.penanda === 'sas' ? 'baris-sumatif' : '';
      baris.push(r);
    });
  }
  return tabel({
    caption: t('prosem.tabelSemester', { semester: nama }),
    kelas: 'tbl-prosem',
    kepala: [t('prosem.bulan'), t('prosem.pekan'), t('rpe.tanggal'), t('atp.modul'), t('prosem.kegiatan'), t('atp.jp'), t('rpe.keterangan')],
    baris
  });
}

/** @param {Object} prosem payload hitungProsem @param {Object} konteks */
export function renderProsem(prosem, konteks) {
  const kurang = prosem.ganjil.kekuranganJP + prosem.genap.kekuranganJP;
  return h('article', { class: 'dokumen dokumen-prosem' },
    kopDokumen(konteks, t('prosem.judul')),
    tabelIdentitas(konteks, [[t('rpe.jpPerPekan'), `${prosem.jpPerPekan} JP`]]),
    kurang > 0
      ? peringatan(t('prosem.peringatanKurang', { jp: angka(kurang) }), 'galat')
      : null,
    h('section', null, h('h2', null, t('prosem.bagianSemester', { semester: t('umum.ganjil') })), tabelProsemSemester(t('umum.ganjil'), prosem.ganjil)),
    h('section', null, h('h2', null, t('prosem.bagianSemester', { semester: t('umum.genap') })), tabelProsemSemester(t('umum.genap'), prosem.genap)),
    h('p', { class: 'catatan' }, t('prosem.catatan')),
    blokTtd(konteks));
}
