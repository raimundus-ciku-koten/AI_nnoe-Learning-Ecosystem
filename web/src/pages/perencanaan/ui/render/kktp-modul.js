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

const PERLU_KONFIRMASI = 'PERLU KONFIRMASI';

function rubrikBerkembang(rubrik) {
  return [
    rubrik?.cukup ? `${t('kktp.levelCukup')}: ${rubrik.cukup}` : '',
    rubrik?.baik ? `${t('kktp.levelBaik')}: ${rubrik.baik}` : '',
  ].filter(Boolean).join(' / ') || PERLU_KONFIRMASI;
}

function tabelKriteriaKktp(kktp, petaTp) {
  const baris = (kktp.items ?? []).map((item, index) => {
    const tp = petaTp.get(normKode(item.kode));
    return [
      String(index + 1),
      item.kode,
      tp?.rumusan || PERLU_KONFIRMASI,
      item.indikator?.join('; ') || PERLU_KONFIRMASI,
      item.asesmen || PERLU_KONFIRMASI,
      item.rubrik?.perluBimbingan || PERLU_KONFIRMASI,
      rubrikBerkembang(item.rubrik),
      item.rubrik?.sangatBaik || PERLU_KONFIRMASI,
      item.tindakLanjut || PERLU_KONFIRMASI,
    ];
  });
  if (baris.length === 0) baris.push([{ teks: PERLU_KONFIRMASI, colspan: 9 }]);
  return tabel({
    caption: t('kktp.tabelTujuan'),
    kelas: 'tbl-kktp tbl-kktp-tujuan',
    kepala: [
      t('rpe.no'), t('atp.kode'), t('atp.tp'), t('kktp.indikator'),
      t('kktp.bentukAsesmen'), t('kktp.kategoriBelum'), t('kktp.kategoriBerkembang'),
      t('kktp.kategoriMahir'), t('kktp.tindakLanjut')
    ],
    baris
  });
}

function tabelRubrikUmum(kktp) {
  const data = kktp.rubrikUmum?.length ? kktp.rubrikUmum : Array.from({ length: 4 }, () => ({
    aspek: PERLU_KONFIRMASI,
    belumBerkembang: PERLU_KONFIRMASI,
    berkembangSesuaiHarapan: PERLU_KONFIRMASI,
    mahir: PERLU_KONFIRMASI,
  }));
  return tabel({
    caption: t('kktp.rubrikUmum'),
    kelas: 'tbl-kktp tbl-kktp-rubrik',
    kepala: [
      t('rpe.no'), t('kktp.aspek'), t('kktp.kategoriBelum'),
      t('kktp.kategoriBerkembangSesuai'), t('kktp.kategoriMahir')
    ],
    baris: data.map((item, index) => [
      String(index + 1),
      item.aspek || PERLU_KONFIRMASI,
      item.belumBerkembang || PERLU_KONFIRMASI,
      item.berkembangSesuaiHarapan || PERLU_KONFIRMASI,
      item.mahir || PERLU_KONFIRMASI,
    ])
  });
}

function tabelKonversiKktp() {
  return tabel({
    caption: t('kktp.konversiCapaian'),
    kelas: 'tbl-kktp tbl-kktp-konversi',
    kepala: [
      t('kktp.kategori'), t('kktp.rentangSkor'), t('kktp.predikat'),
      t('kktp.deskripsi'), t('kktp.tindakLanjut')
    ],
    baris: [
      ['Belum Berkembang', '0–59', 'Perlu Bimbingan', PERLU_KONFIRMASI, t('kktp.tindakBelum')],
      ['Berkembang', '60–79', 'Baik', PERLU_KONFIRMASI, t('kktp.tindakBerkembang')],
      ['Mahir', '80–100', 'Sangat Baik', PERLU_KONFIRMASI, t('kktp.tindakMahir')],
    ]
  });
}

/**
 * @param {Object} kktp {ambang, items:[{kode, indikator[], asesmen, rubrik, tindakLanjut}], rubrikUmum[]}
 * @param {Object} atp  payload ATP (untuk rumusan TP)
 * @param {Object} konteks
 */
export function renderKktp(kktp, atp, konteks) {
  const petaTp = new Map(ratakanTp(atp).map((x) => [normKode(x.kode), x]));
  const konteksIdentitas = {
    ...konteks,
    identitas: {
      ...konteks.identitas,
      sekolah: konteks.identitas?.sekolah || PERLU_KONFIRMASI,
      guru: konteks.identitas?.guru || PERLU_KONFIRMASI,
    },
  };
  return h('article', { class: 'dokumen dokumen-kktp' },
    kopDokumen(konteks, t('kktp.judul')),
    h('section', { class: 'kktp-bagian' },
      h('h2', null, `A. ${t('kktp.identitas')}`),
      tabelIdentitas(konteksIdentitas, [[t('kktp.ambang'), String(kktp.ambang)]])),
    h('section', { class: 'kktp-bagian' },
      h('h2', null, `B. ${t('kktp.landasanPrinsip')}`),
      h('p', null, t('kktp.prinsipKriteria')),
      h('p', null, t('kktp.prinsipBukti')),
      h('p', null, t('kktp.prinsipTindakLanjut'))),
    h('section', { class: 'kktp-bagian' },
      h('h2', null, `C. ${t('kktp.tabelTujuanJudul')}`),
      h('p', null, t('kktp.pemetaanEmpatLevel')),
      tabelKriteriaKktp(kktp, petaTp)),
    h('section', { class: 'kktp-bagian' },
      h('h2', null, `D. ${t('kktp.rubrikUmum')}`),
      tabelRubrikUmum(kktp)),
    h('section', { class: 'kktp-bagian' },
      h('h2', null, `E. ${t('kktp.konversiCapaian')}`),
      h('p', null, t('kktp.konversiPerluKonfirmasi', { ambang: kktp.ambang })),
      tabelKonversiKktp()),
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
