/**
 * @file Renderer Prota dan Prosem.
 */

import { h, tabel, angka } from '../dom.js';
import { t } from '../../i18n/index.js';
import { kopDokumen, tabelIdentitas, blokTtd, peringatan } from './umum.js';
import { teksPekan, rentangTanggal, bulanNama, keteranganPekan } from './format.js';

/* -------------------------------- Prota -------------------------------- */

function tabelAnalisisProta(prota, rpe) {
  const ringkas = [1, 2].map((semester) => {
    const data = prota.program[semester];
    return {
      modul: data.modul.length,
      tp: data.modul.reduce((total, modul) => total + modul.baris.length, 0),
      jpTp: data.jpTP,
      uh: data.uh,
      total: data.jp,
      pekan: rpe?.[semester === 1 ? 'ganjil' : 'genap']?.rekap?.efektif ?? null
    };
  });
  const jumlah = ringkas.reduce((total, semester) => Object.fromEntries(
    Object.keys(semester).map((key) => [
      key,
      semester[key] === null || total[key] === null ? null : total[key] + semester[key]
    ]),
  ), { modul: 0, tp: 0, jpTp: 0, uh: 0, total: 0, pekan: 0 });
  const baris = [
    ['Modul / unit pembelajaran', 'modul'],
    ['Tujuan pembelajaran', 'tp'],
    ['JP materi (TP)', 'jpTp'],
    ['JP Ulangan Harian', 'uh'],
    ['Jumlah JP', 'total'],
    ['Pekan efektif kalender', 'pekan']
  ].map(([label, key], index) => {
    const format = (value) => value === null
      ? 'PERLU KONFIRMASI'
      : ['jpTp', 'uh', 'total'].includes(key) ? `${angka(value)} JP` : angka(value);
    return [
      String(index + 1),
      label,
      format(ringkas[0][key]),
      format(ringkas[1][key]),
      format(jumlah[key])
    ];
  });
  return tabel({
    caption: t('prota.analisisPekanEfektif'),
    kelas: 'tbl-prota tbl-prota-analisis',
    kepala: [t('rpe.no'), t('prota.komponen'), t('umum.ganjil'), t('umum.genap'), t('umum.jumlah')],
    baris
  });
}

function tabelDistribusiProta(prota) {
  const modul = [1, 2].flatMap((semester) =>
    prota.program[semester].modul.map((item) => ({ ...item, semester })))
    .sort((a, b) => a.no - b.no);
  const baris = modul.map((item) => {
    const ganjil = item.semester === 1;
    return [
      String(item.no),
      `${t('atp.modul')} ${item.no}: ${item.nama}`,
      angka(ganjil ? item.jpTP : 0),
      angka(ganjil ? 0 : item.jpTP),
      angka(ganjil ? item.uh : 0),
      angka(ganjil ? 0 : item.uh),
      angka(item.jpTP + item.uh)
    ];
  });
  baris.push([
    '',
    { teks: t('umum.jumlah'), th: true, kelas: 'tebal' },
    angka(prota.program[1].jpTP),
    angka(prota.program[2].jpTP),
    angka(prota.program[1].uh),
    angka(prota.program[2].uh),
    { teks: angka(prota.totalJP), kelas: 'tebal' }
  ]);
  return tabel({
    caption: t('prota.distribusiTahunan'),
    kelas: 'tbl-prota tbl-prota-distribusi',
    kepala: [
      t('rpe.no'), t('prota.modulUnit'), t('prota.jpGanjil'), t('prota.jpGenap'),
      t('prota.uhGanjil'), t('prota.uhGenap'), t('prota.subtotalJP')
    ],
    baris
  });
}

function tabelProtaSemester(nama, sem) {
  const baris = [];
  let nomor = 0;
  for (const m of sem.modul) {
    m.baris.forEach((b, i) => {
      baris.push([
        String(++nomor),
        b.kode,
        b.rumusan,
        b.materi || 'PERLU KONFIRMASI',
        `${angka(b.jp)} JP`,
        teksPekan(b.pekan),
        `${t('atp.modul')} ${m.no}: ${m.nama}`,
        'PERLU KONFIRMASI'
      ]);
    });
    baris.push([
      '–',
      `UH-${m.no}`,
      t('prota.ulanganHarian', { no: m.no }),
      `PERLU KONFIRMASI — ${t('prota.asesmenBelumDitentukan')}`,
      `${angka(m.uh)} JP`,
      teksPekan(m.uhPekan),
      `${t('atp.modul')} ${m.no}: ${m.nama}`,
      'PERLU KONFIRMASI'
    ]);
  }
  if (sem.modul.length === 0) {
    baris.push([{ teks: t('prota.semesterKosong'), colspan: 8 }]);
  }
  baris.push([
    { teks: t('prota.jumlahSemester', { semester: nama }), colspan: 4, kelas: 'tebal' },
    { teks: `${angka(sem.jp)} JP`, kelas: 'tebal' },
    { teks: '', colspan: 3 }
  ]);
  return tabel({
    caption: t('prota.tabelSemester', { semester: nama }),
    kelas: 'tbl-prota',
    kepala: [
      t('rpe.no'), t('atp.kode'), t('atp.tp'), t('atp.materi'), t('atp.jp'),
      t('prota.pekan'), t('atp.modul'), t('atp.strategiAsesmen')
    ],
    baris
  });
}

function tabelMatriksProta(prota) {
  const modul = [1, 2].flatMap((semester) =>
    prota.program[semester].modul.map((item) => ({ ...item, semester })))
    .sort((a, b) => a.no - b.no);
  const baris = [];
  let nomor = 0;
  for (const item of modul) {
    const kode = item.baris.map((tujuan) => tujuan.kode).filter(Boolean);
    const materi = [...new Set(item.baris.map((tujuan) => String(tujuan.materi ?? '').trim()).filter(Boolean))];
    baris.push([
      String(++nomor),
      item.semester === 1 ? t('umum.ganjil') : t('umum.genap'),
      item.elemen || 'PERLU KONFIRMASI',
      `${t('atp.modul')} ${item.no}: ${item.nama}`,
      `${angka(item.jpTP)} JP`,
      `${t('atp.kode')}: ${kode.join(', ') || 'PERLU KONFIRMASI'}. ${t('atp.materi')}: ${materi.join('; ') || 'PERLU KONFIRMASI'}.`
    ]);
    baris.push([
      String(++nomor),
      item.semester === 1 ? t('umum.ganjil') : t('umum.genap'),
      '–',
      t('prota.ulanganHarian', { no: item.no }),
      `${angka(item.uh)} JP`,
      `1 pertemuan; ${t('prota.asesmenBelumDitentukan')}`
    ]);
  }
  baris.push([
    '',
    '',
    '',
    { teks: t('umum.jumlah'), th: true, kelas: 'tebal' },
    { teks: `${angka(prota.totalJP)} JP`, kelas: 'tebal' },
    ''
  ]);
  return tabel({
    caption: t('prota.matriksTahunan'),
    kelas: 'tbl-prota tbl-prota-matriks',
    kepala: [
      t('rpe.no'), t('umum.semester'), t('prota.elemenCP'), t('prota.materiPokok'),
      t('atp.jp'), t('prota.catatanPembelajaran')
    ],
    baris
  });
}

function tabelRekapProta(prota) {
  return tabel({
    caption: t('prota.rekapTahunan'),
    kelas: 'tbl-prota tbl-prota-rekap',
    kepala: [t('prota.kategoriAlokasi'), t('rpe.jumlah')],
    baris: [
      [t('prota.jpTp'), `${angka(prota.jpTP)} JP`],
      [t('prota.uhGanjil'), `${angka(prota.program[1].uh)} JP`],
      [t('prota.uhGenap'), `${angka(prota.program[2].uh)} JP`],
      [t('prota.jpUh'), `${angka(prota.uhTotal)} JP`],
      [
        { teks: t('atp.totalJP'), th: true, kelas: 'tebal' },
        { teks: `${angka(prota.totalJP)} JP`, kelas: 'tebal' }
      ]
    ]
  });
}

/** @param {Object} prota payload hitungRpe→hitungProta (ok) @param {Object} konteks */
export function renderProta(prota, konteks, rpe) {
  const jumlahTp = prota.program[1].modul.concat(prota.program[2].modul)
    .reduce((total, modul) => total + modul.baris.length, 0);
  const analisis = tabelAnalisisProta(prota, rpe);
  const distribusi = tabelDistribusiProta(prota);
  const matriks = tabelMatriksProta(prota);
  const rekap = tabelRekapProta(prota);
  return h('article', { class: 'dokumen dokumen-prota' },
    kopDokumen(konteks, t('prota.judul')),
    h('section', { class: 'prota-bagian' },
      h('h2', null, `1. ${t('prota.informasiUmum')}`),
      h('p', null, t('prota.ringkasanUmum', {
        mapel: konteks.mapel,
        kelas: konteks.kelas,
        tahunAjaran: konteks.tahunAjaran,
        modul: prota.jumlahModul,
        tujuan: jumlahTp
      })),
      tabelIdentitas(konteks, [
        [t('atp.totalJP'), `${angka(prota.totalJP)} JP`],
        [t('prota.jpTp'), `${angka(prota.jpTP)} JP`],
        [t('prota.jpUh'), `${angka(prota.uhTotal)} JP (${prota.jumlahModul} × ${prota.jpPertemuan} JP)`],
        [t('prota.jumlahModul'), angka(prota.jumlahModul)],
        [t('prota.jumlahTujuan'), angka(jumlahTp)]
      ]),
      h('h3', null, t('prota.analisisPekanEfektif')),
      analisis),
    h('section', { class: 'prota-bagian' },
      h('h2', null, `2. ${t('prota.distribusiTahunan')}`),
      h('p', null, t('prota.distribusiPenjelasan')),
      distribusi,
      h('p', { class: 'rumus' }, t('prota.rumus', {
        tp: angka(prota.jpTP),
        uh: angka(prota.uhTotal),
        total: angka(prota.totalJP)
      }))),
    h('section', { class: 'prota-bagian' },
      h('h2', null, `3. ${t('prota.bagianSemester', { semester: t('umum.ganjil') })}`),
      h('p', null, t('prota.ringkasanSemester', {
        semester: t('umum.ganjil'),
        modul: prota.program[1].modul.length,
        jpTp: angka(prota.program[1].jpTP),
        jpUh: angka(prota.program[1].uh),
        total: angka(prota.program[1].jp),
        jpPerPekan: angka(prota.jpPerPekan)
      })),
      tabelProtaSemester(t('umum.ganjil'), prota.program[1])),
    h('section', { class: 'prota-bagian' },
      h('h2', null, `4. ${t('prota.bagianSemester', { semester: t('umum.genap') })}`),
      h('p', null, t('prota.ringkasanSemester', {
        semester: t('umum.genap'),
        modul: prota.program[2].modul.length,
        jpTp: angka(prota.program[2].jpTP),
        jpUh: angka(prota.program[2].uh),
        total: angka(prota.program[2].jp),
        jpPerPekan: angka(prota.jpPerPekan)
      })),
      tabelProtaSemester(t('umum.genap'), prota.program[2])),
    h('section', { class: 'prota-bagian' },
      h('h2', null, `5. ${t('prota.matriksTahunan')}`),
      matriks),
    h('section', { class: 'prota-bagian' },
      h('h2', null, `6. ${t('prota.rekapTahunan')}`),
      rekap),
    h('section', { class: 'prota-bagian' },
      h('h2', null, `7. ${t('prota.catatanPelaksanaan')}`),
      h('p', null, t('prota.catatanKalender')),
      h('p', null, t('prota.catatanAsesmen')),
      blokTtd(konteks)));
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
