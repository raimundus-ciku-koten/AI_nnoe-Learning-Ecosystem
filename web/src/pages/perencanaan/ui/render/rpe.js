/**
 * @file Renderer RPE: payload hasil hitungRpe → elemen DOM.
 */

import { h, tabel, angka } from '../dom.js';
import { t } from '../../i18n/index.js';
import { NAMA_HARI } from '../../constants.js';
import { kopDokumen, tabelIdentitas, blokTtd, peringatan } from './umum.js';
import { rentangTanggal, keteranganPekan } from './format.js';

function tabelSemester(nama, sem) {
  const baris = sem.pekan.map((p) => {
    const b = [
      String(p.noSemester),
      rentangTanggal(p.mulai, p.selesai),
      p.efektif ? t('rpe.efektif') : t('rpe.nonEfektif'),
      p.jp ? String(p.jp) : '–',
      keteranganPekan(p)
    ];
    b.kelas = p.efektif ? '' : 'baris-nonefektif'; // dipakai tabel() sebagai class <tr>
    return b;
  });
  return tabel({
    caption: t('rpe.tabelSemester', { semester: nama }),
    kelas: 'tbl-rpe',
    kepala: [t('rpe.no'), t('rpe.tanggal'), t('rpe.status'), t('rpe.jp'), t('rpe.keterangan')],
    baris
  });
}

/**
 * @param {Object} rpe payload hasil hitungRpe
 * @param {Object} konteks konteks paket
 * @returns {HTMLElement}
 */
export function renderRpe(rpe, konteks) {
  const hariTeks = rpe.hari
    .map((i) => `${NAMA_HARI[i]} (${rpe.jpPerHari?.[i] ?? rpe.jpPerPekan} JP)`)
    .join(', ');
  const rekap = tabel({
    caption: t('rpe.rekap'),
    kepala: [t('umum.semester'), t('rpe.totalPekan'), t('rpe.pekanEfektif'), t('rpe.pekanNon'), t('rpe.jp')],
    baris: [
      [t('umum.ganjil'), rpe.ganjil.rekap.totalPekan, rpe.ganjil.rekap.efektif, rpe.ganjil.rekap.nonEfektif, rpe.ganjil.rekap.totalJP],
      [t('umum.genap'), rpe.genap.rekap.totalPekan, rpe.genap.rekap.efektif, rpe.genap.rekap.nonEfektif, rpe.genap.rekap.totalJP],
      [{ teks: t('umum.jumlah'), th: true, kelas: 'tebal' }, rpe.ganjil.rekap.totalPekan + rpe.genap.rekap.totalPekan,
        rpe.ganjil.rekap.efektif + rpe.genap.rekap.efektif, rpe.ganjil.rekap.nonEfektif + rpe.genap.rekap.nonEfektif,
        { teks: rpe.totalJPHitung, kelas: 'tebal' }]
    ].map((b) => b.map((s) => (typeof s === 'number' ? angka(s) : s)))
  });

  return h('article', { class: 'dokumen dokumen-rpe' },
    kopDokumen(konteks, t('rpe.judul')),
    tabelIdentitas(konteks, [
      [t('rpe.jpPerPekan'), `${rpe.jpPerPekan} JP`],
      [t('rpe.hari'), hariTeks],
      [t('rpe.totalJPHitung'), `${angka(rpe.totalJPHitung)} JP`],
      ...(rpe.selisihDenganResmi !== 0 ? [[t('rpe.totalJPResmi'), `${angka(rpe.totalJP)} JP`]] : [])
    ]),
    rpe.selisihDenganResmi !== 0
      ? peringatan(t('rpe.peringatanSelisih', { resmi: angka(rpe.totalJP), hitung: angka(rpe.totalJPHitung), selisih: angka(Math.abs(rpe.selisihDenganResmi)) }))
      : null,
    h('section', null, h('h2', null, t('rpe.bagianSemester', { semester: t('umum.ganjil') })), tabelSemester(t('umum.ganjil'), rpe.ganjil)),
    h('section', null, h('h2', null, t('rpe.bagianSemester', { semester: t('umum.genap') })), tabelSemester(t('umum.genap'), rpe.genap)),
    h('section', null, h('h2', null, t('rpe.rekap')), rekap,
      h('p', { class: 'rumus' }, t('rpe.rumus'))),
    blokTtd(konteks));
}
