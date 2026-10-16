/**
 * @file Renderer ATP (baca-saja & cetak). Rekap (Bagian 4) diturunkan dari rekapAtp(),
 * fungsi yang sama dengan Prota, sehingga Pembagian per Semester dan Rekap Tahunan
 * selalu sinkron.
 */

import { h, tabel, angka } from '../dom.js';
import { t } from '../../i18n/index.js';
import { rekapAtp } from '../../engine/prota.js';
import { kopDokumen, tabelIdentitas, blokTtd } from './umum.js';

const namaSemester = (s) => (s === 2 ? t('umum.genap') : t('umum.ganjil'));

/**
 * @param {Object} atp payload ATP { cp, unit, anggaran, totalJP }
 * @param {Object} konteks
 */
export function renderAtp(atp, konteks) {
  const unit = atp.unit.filter((u) => u.tp?.length);
  const jpUH = atp.anggaran?.jpPertemuan ?? 0;
  const rekap = rekapAtp({ ...atp, unit }, jpUH);

  const baris1 = (atp.cp ?? []).map((c) => [c.elemen, c.cp]);

  const baris2 = [];
  unit.forEach((u) => {
    u.tp.forEach((tp, i) => {
      baris2.push([
        i === 0 ? { teks: `${t('atp.unit')} ${u.no}. ${u.nama}`, rowspan: u.tp.length, kelas: 'sel-unit' } : null,
        tp.kode, tp.rumusan, tp.materi, String(tp.jp), namaSemester(u.semester)
      ].filter((x) => x !== null));
    });
  });

  const baris3 = unit.map((u) => {
    const jp = u.tp.reduce((s, x) => s + x.jp, 0);
    return [
      namaSemester(u.semester), `${t('atp.modul')} ${u.no}: ${u.nama}`, u.tp.map((x) => x.kode).join(', '),
      String(jp), String(jpUH), String(jp + jpUH)
    ];
  });

  const baris4 = [
    [t('atp.jpTpGanjil'), angka(rekap.ganjil.jpTP)],
    [t('atp.jpTpGenap'), angka(rekap.genap.jpTP)],
    [t('atp.uhGanjil'), angka(rekap.ganjil.uh)],
    [t('atp.uhGenap'), angka(rekap.genap.uh)],
    [t('atp.subtotalGanjil'), angka(rekap.ganjil.subtotal)],
    [t('atp.subtotalGenap'), angka(rekap.genap.subtotal)],
    [{ teks: t('atp.totalTahun'), kelas: 'tebal' }, { teks: angka(rekap.total), kelas: 'tebal' }]
  ];

  return h('article', { class: 'dokumen dokumen-atp' },
    kopDokumen(konteks, t('atp.judul')),
    tabelIdentitas(konteks, [[t('atp.totalJP'), `${angka(atp.totalJP ?? rekap.total)} JP`]]),
    h('section', null, h('h2', null, t('atp.bagianCp')),
      tabel({ caption: t('atp.bagianCp'), kepala: [t('atp.elemen'), t('atp.cp')], baris: baris1 })),
    h('section', null, h('h2', null, t('atp.bagianPeta')),
      tabel({
        caption: t('atp.bagianPeta'), kelas: 'tbl-atp',
        kepala: [t('atp.unit'), t('atp.kode'), t('atp.tp'), t('atp.materi'), t('atp.jp'), t('umum.semester')],
        baris: baris2
      })),
    h('section', null, h('h2', null, t('atp.bagianSemester')),
      tabel({
        caption: t('atp.bagianSemester'),
        kepala: [t('umum.semester'), t('atp.modul'), t('atp.kodeTerkait'), t('atp.jpTp'), t('atp.jpUh'), t('atp.subtotal')],
        baris: baris3
      })),
    h('section', null, h('h2', null, t('atp.bagianRekap')),
      tabel({ caption: t('atp.bagianRekap'), kepala: [t('atp.komponen'), t('atp.jumlahJp')], baris: baris4 })),
    blokTtd(konteks));
}
