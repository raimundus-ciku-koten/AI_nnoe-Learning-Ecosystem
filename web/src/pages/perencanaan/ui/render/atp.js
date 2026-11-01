/**
 * @file Renderer ATP (baca-saja & cetak), mengikuti enam bagian struktur legacy.
 */

import { h, tabel, angka } from '../dom.js';
import { t } from '../../i18n/index.js';
import { rekapAtp } from '../../engine/prota.js';
import { blokTtd, kopDokumen, tabelIdentitas } from './umum.js';

const namaSemester = (semester) => (semester === 2 ? t('umum.genap') : t('umum.ganjil'));
const belumAda = () => t('umum.perluKonfirmasi');
const teks = (value) => typeof value === 'string' && value.trim() ? value : belumAda();
const daftar = (items) => Array.isArray(items) && items.length ? items.join(', ') : belumAda();

export function renderAtp(atp, konteks) {
  const unit = (atp.unit ?? []).filter((item) => item.tp?.length);
  const uhValid = Number.isInteger(atp.anggaran?.jpPertemuan) && atp.anggaran.jpPertemuan > 0;
  const jpUH = uhValid ? atp.anggaran.jpPertemuan : 0;
  const rekap = rekapAtp({ ...atp, unit }, jpUH);
  const totalJP = atp.totalJP ?? rekap.total;
  const totalUH = rekap.ganjil.uh + rekap.genap.uh;
  const totalJpTp = rekap.ganjil.jpTP + rekap.genap.jpTP;
  const tambahanIdentitas = [
    [t('atp.jpPerPekan'), atp.jpPerPekan ? `${angka(atp.jpPerPekan)} JP` : belumAda()],
    [t('atp.totalJP'), `${angka(totalJP)} JP`],
  ];

  const bagianPenurunan = unit.map((item) => h('section', null,
    h('h3', null, `${t('atp.unit')} ${item.no}. ${item.nama}`),
    tabel({
      caption: t('atp.tabelPenurunan', { no: item.no, nama: item.nama }),
      kepala: [t('atp.unitPembelajaran'), t('atp.kode'), t('atp.tp'), t('atp.nomorModul')],
      baris: item.tp.map((tp) => [item.nama, tp.kode, tp.rumusan, String(item.no)]),
    })));

  const bagianRancangan = unit.map((item) => {
    const jpUnit = item.tp.reduce((sum, tp) => sum + tp.jp, 0);
    const glosarium = Array.isArray(item.glosarium) && item.glosarium.length
      ? item.glosarium.map((term) => `${term.istilah}: ${teks(term.makna)}`).join('; ')
      : belumAda();
    return h('section', null,
      h('h3', null, `${t('atp.unit')} ${item.no}. ${item.nama}`),
      tabel({
        caption: t('atp.metadataUnit', { no: item.no, nama: item.nama }),
        kepala: [t('atp.komponenUnit'), t('atp.deskripsiUnit')],
        baris: [
          [t('atp.tujuanUnit'), teks(item.tujuanUnit)],
          [t('atp.elemen'), teks(item.elemen)],
          [t('atp.alokasiUnit'), `${angka(jpUnit)} JP`],
          [t('atp.kataKunci'), daftar(item.kataKunci)],
          [t('atp.prosesPembelajaran'), teks(item.isiProsesPembelajaran)],
          [t('atp.dimensiProfil'), daftar(item.dimensiProfil)],
          [t('atp.glosarium'), glosarium],
        ],
      }),
      tabel({
        caption: t('atp.distribusiUnit', { no: item.no, nama: item.nama }),
        kepala: [t('atp.kode'), t('atp.tp'), t('atp.materi'), t('atp.jp'), t('atp.modul')],
        baris: [
          ...item.tp.map((tp) => [
            tp.kode, tp.rumusan, teks(tp.materi), String(tp.jp), String(item.no),
          ]),
          ...(uhValid
            ? [[belumAda(), t('atp.ulanganHarianUnit'), '', String(jpUH), String(item.no)]]
            : []),
        ],
      }));
  });

  let nomorTp = 0;
  const matriks = unit.flatMap((item) => item.tp.map((tp) => [
    String(++nomorTp),
    tp.kode,
    teks(item.elemen),
    tp.rumusan,
    teks(tp.materi),
    daftar(item.dimensiProfil),
    String(tp.jp),
    String(item.no),
    teks(tp.strategiAsesmen),
  ]));

  const pembagianSemester = unit.map((item) => {
    const jpTP = item.tp.reduce((sum, tp) => sum + tp.jp, 0);
    return [
      namaSemester(item.semester),
      `${t('atp.modul')} ${item.no}: ${item.nama}`,
      item.tp.map((tp) => tp.kode).join(', '),
      String(jpTP),
      uhValid ? String(jpUH) : belumAda(),
      uhValid ? String(jpTP + jpUH) : belumAda(),
    ];
  });

  const rekapTahunan = [
    [t('atp.jpTpGanjil'), angka(rekap.ganjil.jpTP)],
    [t('atp.jpTpGenap'), angka(rekap.genap.jpTP)],
    [t('atp.totalJpTp'), angka(totalJpTp)],
    [t('atp.uhGanjil'), uhValid ? angka(rekap.ganjil.uh) : belumAda()],
    [t('atp.uhGenap'), uhValid ? angka(rekap.genap.uh) : belumAda()],
    [t('atp.totalUH'), uhValid ? angka(totalUH) : belumAda()],
    [t('atp.subtotalGanjil'), uhValid ? angka(rekap.ganjil.subtotal) : belumAda()],
    [t('atp.subtotalGenap'), uhValid ? angka(rekap.genap.subtotal) : belumAda()],
    [{
      teks: t('atp.totalTahun'),
      kelas: 'tebal',
    }, {
      teks: uhValid ? `${angka(rekap.total)} JP` : belumAda(),
      kelas: 'tebal',
    }],
  ];

  return h('article', { class: 'dokumen dokumen-atp' },
    kopDokumen(konteks, t('atp.judul')),
    h('section', null,
      h('h2', null, t('atp.bagianInfoCp')),
      tabelIdentitas(konteks, tambahanIdentitas),
      h('h3', null, t('atp.cpPerElemen')),
      tabel({
        caption: t('atp.cpPerElemen'),
        kepala: [t('atp.no'), t('atp.elemen'), t('atp.cp')],
        baris: (atp.cp ?? []).map((item, index) => [String(index + 1), item.elemen, item.cp]),
      })),
    h('section', null,
      h('h2', null, t('atp.bagianPenurunan')),
      ...bagianPenurunan),
    h('section', null,
      h('h2', null, t('atp.bagianRasionalisasi')),
      h('p', null, teks(atp.rasionalisasi)),
      ...bagianRancangan),
    h('section', null,
      h('h2', null, t('atp.bagianMatriks')),
      tabel({
        caption: t('atp.bagianMatriks'),
        kelas: 'tbl-atp',
        kepala: [
          t('atp.no'), t('atp.kode'), t('atp.elemen'), t('atp.tp'),
          t('atp.materi'), t('atp.dimensiProfil'), t('atp.jp'),
          t('atp.nomorModul'), t('atp.strategiAsesmen'),
        ],
        baris: matriks,
      })),
    h('section', null,
      h('h2', null, t('atp.bagianSemester')),
      tabel({
        caption: t('atp.bagianSemester'),
        kepala: [
          t('umum.semester'), t('atp.modul'), t('atp.kodeTerkait'),
          t('atp.jpTp'), t('atp.jpUh'), t('atp.subtotal'),
        ],
        baris: pembagianSemester,
      })),
    h('section', null,
      h('h2', null, t('atp.bagianRekap')),
      tabel({
        caption: t('atp.bagianRekap'),
        kepala: [t('atp.komponen'), t('atp.jumlahJp')],
        baris: rekapTahunan,
      })),
    blokTtd(konteks));
}
