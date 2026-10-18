/**
 * @file Renderer KKTP dan Modul Ajar. Teks AI hanya disisipkan sebagai teks (aman dari XSS).
 */

import { h, tabel } from '../dom.js';
import { t } from '../../i18n/index.js';
import { ratakanTp, normKode, sumberBelajarModul } from '../../engine/prota.js';
import { kopDokumen, tabelIdentitas, blokTtd } from './umum.js';

const daftar = (items) => items?.length ? h('ul', null, items.map((x) => h('li', null, x))) : null;
const paragraf = (teks) => (teks ? h('p', null, teks) : null);

/* --------------------------------- KKTP --------------------------------- */

/**
 * @param {Object} kktp { ambang, items:[{kode, indikator[], rubrik{...}}] }
 * @param {Object} atp  payload ATP (untuk rumusan TP)
 * @param {Object} konteks
 */
export function renderKktp(kktp, atp, konteks) {
  const petaTp = new Map(ratakanTp(atp).map((x) => [normKode(x.kode), x]));
  const level = [
    ['perluBimbingan', t('kktp.levelPerluBimbingan')],
    ['cukup', t('kktp.levelCukup')],
    ['baik', t('kktp.levelBaik')],
    ['sangatBaik', t('kktp.levelSangatBaik')]
  ];
  return h('article', { class: 'dokumen dokumen-kktp' },
    kopDokumen(konteks, t('kktp.judul')),
    tabelIdentitas(konteks, [[t('kktp.ambang'), String(kktp.ambang)]]),
    kktp.items.map((it) => {
      const tp = petaTp.get(normKode(it.kode));
      return h('section', { class: 'blok-tp' },
        h('h2', null, `${it.kode}`),
        tp ? h('p', { class: 'rumusan-tp' }, tp.rumusan) : null,
        h('h3', null, t('kktp.indikator')),
        daftar(it.indikator),
        tabel({
          caption: t('kktp.rubrikUntuk', { kode: it.kode }),
          kepala: [t('kktp.level'), t('kktp.deskripsi')],
          baris: level.map(([k, label]) => [label, it.rubrik?.[k] ?? ''])
        }));
    }),
    blokTtd(konteks));
}

/* --------------------------------- Modul --------------------------------- */

/**
 * @param {Object} modul payload satu unit
 * @param {{no:number, nama:string}} unit
 * @param {Object} konteks
 */
export function renderModul(modul, unit, konteks, atp, prota, prosem) {
  const bagian = (judul, isi) => (isi ? h('section', null, h('h2', null, judul), isi) : null);
  const kegiatan = (judul, items) => items?.length
    ? h('div', null, h('h4', null, judul), daftar(items))
    : null;
  const sumber = sumberBelajarModul(atp, unit, prota, prosem);
  const ringkasanAlokasi = sumber.alokasi
    ? `${t(`umum.${sumber.alokasi.semester === 1 ? 'ganjil' : 'genap'}`)}: ${sumber.alokasi.jp} JP (${sumber.alokasi.jpTP} JP TP + ${sumber.alokasi.uh} JP UH)`
    : '';
  const tanggal = (value) => new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(`${value}T00:00:00Z`));
  return h('article', { class: 'dokumen dokumen-modul' },
    kopDokumen(konteks, `${t('modul.judul')} — ${t('atp.modul')} ${unit.no}: ${unit.nama}`),
    tabelIdentitas(konteks, [
      [t('modul.model'), modul.model],
      [t('modul.tujuanKode'), (modul.tujuanKode ?? []).join(', ')],
      [t('modul.alokasiSumberProta'), ringkasanAlokasi]
    ]),
    bagian(t('modul.cpSumberAtp'), daftar(sumber.cp.map((item) => item.cp))),
    bagian(t('modul.tpMateriSumberAtp'), daftar(
      sumber.tp.map((item) => `${item.kode}: ${item.rumusan} — ${item.materi}`),
    )),
    bagian(t('modul.jadwalSumberProsem'), daftar(sumber.jadwal.map((item) =>
      `${t(`umum.${item.semester === 1 ? 'ganjil' : 'genap'}`)} · ${t('prosem.pekan')}${item.pekan} · ${tanggal(item.mulai)}–${tanggal(item.selesai)} · ${item.jp} JP`,
    ))),
    bagian(t('modul.pemahaman'), daftar(modul.pemahamanBermakna)),
    bagian(t('modul.pemantik'), daftar(modul.pertanyaanPemantik)),
    bagian(t('modul.profil'), daftar(modul.dimensiProfil)),
    bagian(t('modul.sarpras'), daftar(modul.sarpras)),
    bagian(t('modul.pertemuan'), (modul.pertemuan ?? []).map((p) => h('div', { class: 'blok-pertemuan' },
      h('h3', null, `${t('modul.pertemuanKe', { ke: p.ke })}${p.judul ? `: ${p.judul}` : ''}${p.menit ? ` (${p.menit} ${t('umum.menit')})` : ''}`),
      paragraf(p.tujuan),
      kegiatan(t('modul.pendahuluan'), p.pendahuluan),
      kegiatan(t('modul.inti'), p.inti),
      kegiatan(t('modul.penutup'), p.penutup)))),
    bagian(t('modul.asesmen'), h('div', null,
      modul.asesmen?.diagnostik ? h('p', null, h('strong', null, `${t('modul.diagnostik')}: `), modul.asesmen.diagnostik) : null,
      modul.asesmen?.formatif ? h('p', null, h('strong', null, `${t('modul.formatif')}: `), modul.asesmen.formatif) : null,
      modul.asesmen?.sumatif ? h('p', null, h('strong', null, `${t('modul.sumatif')}: `), modul.asesmen.sumatif) : null)),
    bagian(t('modul.remedial'), paragraf(modul.remedial)),
    bagian(t('modul.pengayaan'), paragraf(modul.pengayaan)),
    bagian(t('modul.refleksi'), daftar([...(modul.refleksiGuru ?? []), ...(modul.refleksiSiswa ?? [])])),
    blokTtd(konteks));
}
