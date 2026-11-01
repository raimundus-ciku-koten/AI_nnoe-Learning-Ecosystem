/**
 * @file Renderer RPE: payload hasil hitungRpe → elemen DOM.
 */

import { h, tabel, angka } from '../dom.js';
import { t } from '../../i18n/index.js';
import { NAMA_HARI } from '../../constants.js';
import { kopDokumen, tabelIdentitas, blokTtd, peringatan } from './umum.js';
import { bulanNama, hariNama, rentangTanggal, keteranganPekan, pekanDalamBulan } from './format.js';

function tabelSemester(nama, sem, jpPerPekan) {
  const baris = sem.pekan.map((p) => {
    const b = [
      String(p.noSemester),
      bulanNama(Number(p.mulai.slice(5, 7))),
      String(pekanDalamBulan(p.mulai)),
      rentangTanggal(p.mulai, p.selesai),
      p.efektif ? t('rpe.efektif') : t('rpe.nonEfektif'),
      p.efektif ? angka(jpPerPekan) : '0',
      keteranganPekan(p)
    ];
    b.kelas = p.efektif ? '' : 'baris-nonefektif'; // dipakai tabel() sebagai class <tr>
    return b;
  });
  return tabel({
    caption: t('rpe.tabelSemester', { semester: nama }),
    kelas: 'tbl-rpe',
    kepala: [t('rpe.no'), t('rpe.bulan'), t('rpe.pekanBulan'), t('rpe.tanggal'), t('rpe.status'), t('rpe.jp'), t('rpe.keterangan')],
    baris
  });
}

function tabelPekanTidakEfektif(nama, pekan) {
  const nonEfektif = pekan.filter((p) => !p.efektif);
  if (nonEfektif.length === 0) {
    return h('p', { class: 'rpe-keterangan-kosong' },
      `Tidak ada pekan tidak efektif pada Semester ${nama}.`);
  }
  return tabel({
    caption: t('rpe.tabelNonEfektif', { semester: nama }),
    kelas: 'tbl-rpe tbl-rpe-non-efektif',
    kepala: [
      t('rpe.no'),
      t('rpe.pekanBulan'),
      t('rpe.tanggalPekan'),
      t('rpe.hariPembelajaranLibur'),
      t('rpe.alasanNonEfektif')
    ],
    baris: nonEfektif.map((p, index) => [
      String(index + 1),
      String(pekanDalamBulan(p.mulai)),
      rentangTanggal(p.mulai, p.selesai),
      p.hariTidakEfektif.map((hari) => `${hariNama(hari.tanggal)} ${rentangTanggal(hari.tanggal, hari.tanggal)}`).join(', '),
      [...new Set(p.hariTidakEfektif.map((hari) => hari.ket).filter(Boolean))].join('; ') || keteranganPekan(p)
    ])
  });
}

function bagian(nomor, judul, ...isi) {
  return h('section', { class: 'rpe-bagian' },
    h('h2', null, `${nomor}. ${judul}`),
    ...isi);
}

/**
 * @param {Object} rpe payload hasil hitungRpe
 * @param {Object} konteks konteks paket
 * @returns {HTMLElement}
 */
export function renderRpe(rpe, konteks) {
  const hariTeks = rpe.hari.map((i) => NAMA_HARI[i]).join(', ');
  const distribusi = tabel({
    caption: t('rpe.tabelDistribusi'),
    kepala: [t('umum.semester'), t('rpe.pekanEfektif'), t('rpe.pekanNon'), `${t('rpe.jp')} / pekan`, t('rpe.totalJP')],
    baris: [
      [t('umum.ganjil'), rpe.ganjil.rekap.efektif, rpe.ganjil.rekap.nonEfektif, `${rpe.jpPerPekan} JP`, `${angka(rpe.ganjil.rekap.totalJP)} JP`],
      [t('umum.genap'), rpe.genap.rekap.efektif, rpe.genap.rekap.nonEfektif, `${rpe.jpPerPekan} JP`, `${angka(rpe.genap.rekap.totalJP)} JP`],
      [{ teks: t('umum.jumlah'), th: true, kelas: 'tebal' },
        rpe.ganjil.rekap.efektif + rpe.genap.rekap.efektif, rpe.ganjil.rekap.nonEfektif + rpe.genap.rekap.nonEfektif,
        '–', { teks: `${angka(rpe.totalJPHitung)} JP`, kelas: 'tebal' }]
    ].map((baris) => baris.map((sel) => typeof sel === 'number' ? angka(sel) : sel))
  });
  const rekapTahunan = tabel({
    caption: t('rpe.tabelRekap'),
    kepala: [t('rpe.kategori'), t('rpe.jumlah')],
    baris: [
      [t('rpe.pekanEfektif') + ' Semester Ganjil', angka(rpe.ganjil.rekap.efektif)],
      [t('rpe.pekanEfektif') + ' Semester Genap', angka(rpe.genap.rekap.efektif)],
      [t('rpe.pekanNon'), angka(rpe.ganjil.rekap.nonEfektif + rpe.genap.rekap.nonEfektif)],
      [t('rpe.jpPerPekan'), `${angka(rpe.jpPerPekan)} JP`],
      [{ teks: t('rpe.totalJP'), th: true, kelas: 'tebal' }, { teks: `${angka(rpe.totalJPHitung)} JP`, kelas: 'tebal' }],
      ...(rpe.selisihDenganResmi !== 0
        ? [[t('rpe.totalJPResmi'), `${angka(rpe.totalJP)} JP`]]
        : [])
    ]
  });
  const totalPekanEfektif = rpe.ganjil.rekap.efektif + rpe.genap.rekap.efektif;

  return h('article', { class: 'dokumen dokumen-rpe' },
    kopDokumen(konteks, t('rpe.judul')),
    bagian(1, t('rpe.identitas'),
      tabelIdentitas(konteks, [
        [t('rpe.jpPerPekan'), `${rpe.jpPerPekan} JP`],
        [t('rpe.hari'), hariTeks],
        [t('rpe.totalJPHitung'), `${angka(rpe.totalJPHitung)} JP`],
        ...(rpe.selisihDenganResmi !== 0 ? [[t('rpe.totalJPResmi'), `${angka(rpe.totalJP)} JP`]] : [])
      ]),
      rpe.selisihDenganResmi !== 0
        ? peringatan(t('rpe.peringatanSelisih', {
          resmi: angka(rpe.totalJP),
          hitung: angka(rpe.totalJPHitung),
          selisih: angka(Math.abs(rpe.selisihDenganResmi))
        }))
        : null),
    bagian(2, t('rpe.landasanPenyusunan'),
      h('p', null, t('rpe.landasanPenyusunanText')),
      h('p', null, t('rpe.landasanHari')),
      h('p', null, t('rpe.landasanLibur'))),
    bagian(3, t('rpe.landasanHitung'),
      h('p', null, t('rpe.landasanData')),
      h('p', { class: 'rumus' }, t('rpe.rumus', {
        g: rpe.ganjil.rekap.efektif,
        n: rpe.genap.rekap.efektif,
        jp: rpe.jpPerPekan,
        total: angka(rpe.totalJPHitung)
      }))),
    bagian(4, t('rpe.pekanEfektifSemester', { semester: t('umum.ganjil') }),
      h('p', null, `${t('umum.ganjil')}: ${rentangTanggal(rpe.ganjil.mulai, rpe.ganjil.selesai)}. ${rpe.ganjil.rekap.efektif} pekan efektif dari ${rpe.ganjil.rekap.totalPekan}; total ${angka(rpe.ganjil.rekap.totalJP)} JP.`),
      tabelSemester(t('umum.ganjil'), rpe.ganjil, rpe.jpPerPekan),
      tabelPekanTidakEfektif(t('umum.ganjil'), rpe.ganjil.pekan)),
    bagian(5, t('rpe.pekanEfektifSemester', { semester: t('umum.genap') }),
      h('p', null, `${t('umum.genap')}: ${rentangTanggal(rpe.genap.mulai, rpe.genap.selesai)}. ${rpe.genap.rekap.efektif} pekan efektif dari ${rpe.genap.rekap.totalPekan}; total ${angka(rpe.genap.rekap.totalJP)} JP.`),
      tabelSemester(t('umum.genap'), rpe.genap, rpe.jpPerPekan),
      tabelPekanTidakEfektif(t('umum.genap'), rpe.genap.pekan)),
    bagian(6, t('rpe.distribusiRekapitulasi'), distribusi, rekapTahunan),
    bagian(7, t('rpe.penutupPengesahan'),
      h('p', null, `${t('rpe.penutup')} ${totalPekanEfektif} pekan efektif menghasilkan ${angka(rpe.totalJPHitung)} JP.`),
      blokTtd(konteks)));
}
