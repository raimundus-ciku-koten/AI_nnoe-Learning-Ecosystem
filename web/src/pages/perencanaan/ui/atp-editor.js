/**
 * @file Penyunting Peta Sebaran TP: ubah / hapus / simpan per baris, tambah TP dan unit.
 *
 * Perubahan hanya terjadi pada salinan kerja (draft) di memori. Halaman induk menyimpan ke
 * vault Drive lewat tombol "Simpan perubahan" (dengan kontrol versi `rev`). Penyunting memberi
 * umpan balik langsung: galat per baris, dan penunjuk Σ JP TP terhadap anggaran.
 */

import { h, kosongkan, angka } from './dom.js';
import { t } from '../i18n/index.js';
import { BATAS } from '../constants.js';
import { bersihkanTeks } from '../engine/validator.js';
import { hitungAnggaran, normKode, selaraskanJpAtp } from '../engine/prota.js';

/**
 * @param {Object} o
 * @param {Object} o.atp payload ATP awal
 * @param {number} o.totalJP
 * @param {number} o.jpPerPekan
 * @param {number} o.jumlahHari
 * @param {(atp:Object) => void} o.onChange dipanggil setiap draft berubah (untuk mengaktifkan tombol simpan)
 * @returns {{el:HTMLElement, ambil:() => Object}}
 */
export function buatAtpEditor({ atp, totalJP, jpPerPekan, jumlahHari, onChange }) {
  let draft = structuredClone(atp);
  /** @type {{u:number, i:number, baru:boolean}|null} */
  let sedangUbah = null;
  let galatBaris = '';

  const akar = h('div', { class: 'atp-editor' });

  const semuaKode = (kecuali) => draft.unit.flatMap((u, ui) => u.tp.map((x, ti) => ({ k: normKode(x.kode), ui, ti })))
    .filter((x) => !(kecuali && x.ui === kecuali.u && x.ti === kecuali.i)).map((x) => x.k);

  const berubah = () => { onChange(structuredClone(draft)); gambar(); };

  const renumber = () => draft.unit.forEach((u, i) => { u.no = i + 1; });

  /* ----------------------------- Ringkasan JP ----------------------------- */
  function ringkasan() {
    const unitIsi = draft.unit.filter((u) => u.tp.length);
    const ang = hitungAnggaran(unitIsi.length, totalJP, jpPerPekan, jumlahHari);
    const jpTp = draft.unit.reduce((s, u) => s + u.tp.reduce((x, y) => x + (y.jp || 0), 0), 0);
    if (!ang.ok) return h('p', { class: 'kotak kotak-galat', role: 'alert' }, t(`galat.${ang.alasan}`));
    const cocok = jpTp === ang.sisaTP;
    return h('div', { class: `ringkas-jp ${cocok ? 'ok' : 'beda'}`, role: 'status', 'aria-live': 'polite' },
      h('span', null, t('atpEditor.ringkas', { jpTp: angka(jpTp), target: angka(ang.sisaTP), uh: angka(ang.uhTotal), total: angka(totalJP) })),
      cocok ? null : h('button', {
        type: 'button', class: 'tombol tombol-kecil',
        onClick: () => {
          const r = selaraskanJpAtp(draft, totalJP, jpPerPekan, jumlahHari);
          if (r.ok) { draft = r.atp; sedangUbah = null; berubah(); }
        }
      }, t('atpEditor.selaraskan')));
  }

  /* ------------------------------ Baris TP ------------------------------ */
  function barisLihat(u, ui, tp, ti) {
    return h('tr', null,
      h('td', null, tp.kode),
      h('td', null, tp.rumusan),
      h('td', null, tp.materi),
      h('td', { class: 'angka' }, String(tp.jp)),
      h('td', { class: 'aksi' },
        h('button', { type: 'button', class: 'tombol tombol-kecil tombol-sekunder', disabled: sedangUbah !== null,
          'aria-label': t('atpEditor.ubahTp', { kode: tp.kode }),
          onClick: () => { sedangUbah = { u: ui, i: ti, baru: false }; galatBaris = ''; gambar(); } }, t('umum.ubah')),
        h('button', { type: 'button', class: 'tombol tombol-kecil tombol-bahaya', disabled: sedangUbah !== null,
          'aria-label': t('atpEditor.hapusTp', { kode: tp.kode }),
          onClick: () => { draft.unit[ui].tp.splice(ti, 1); berubah(); } }, t('umum.hapus'))));
  }

  function barisUbah(u, ui, tp, ti) {
    const kode = h('input', { type: 'text', value: tp.kode, maxlength: 20, 'aria-label': t('atp.kode'), required: true });
    const rumusan = h('textarea', { rows: 3, maxlength: 1200, 'aria-label': t('atp.tp'), required: true }, tp.rumusan);
    const materi = h('input', { type: 'text', value: tp.materi, maxlength: BATAS.TEKS_SEDANG, 'aria-label': t('atp.materi') });
    const jp = h('input', { type: 'number', value: tp.jp || 1, min: 1, max: 99, step: 1, inputmode: 'numeric', 'aria-label': t('atp.jp') });
    const pesan = h('p', { class: 'galat-baris', role: 'alert' }, galatBaris);

    const simpan = () => {
      const k = bersihkanTeks(kode.value, 20);
      const r = bersihkanTeks(rumusan.value, 1200);
      const m = bersihkanTeks(materi.value);
      const j = Number(jp.value);
      let galat = '';
      if (!k) galat = t('atpEditor.galatKode');
      else if (semuaKode(sedangUbah.baru ? null : sedangUbah).includes(normKode(k))) galat = t('atpEditor.galatKodeGanda');
      else if (!r) galat = t('atpEditor.galatRumusan');
      else if (!Number.isInteger(j) || j < 1) galat = t('atpEditor.galatJp');
      if (galat) { pesan.textContent = galat; galatBaris = galat; (galat === t('atpEditor.galatRumusan') ? rumusan : galat === t('atpEditor.galatJp') ? jp : kode).focus(); return; }
      draft.unit[ui].tp[ti] = { kode: k, rumusan: r, materi: m, jp: j };
      sedangUbah = null; galatBaris = '';
      berubah();
    };
    const batal = () => {
      if (sedangUbah.baru) draft.unit[ui].tp.splice(ti, 1);
      sedangUbah = null; galatBaris = '';
      berubah();
    };
    const tekanKunci = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); batal(); }
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); simpan(); }
    };

    const tr = h('tr', { class: 'baris-ubah', onKeydown: tekanKunci },
      h('td', null, kode), h('td', null, rumusan, pesan), h('td', null, materi), h('td', null, jp),
      h('td', { class: 'aksi' },
        h('button', { type: 'button', class: 'tombol tombol-kecil', onClick: simpan }, t('umum.simpan')),
        h('button', { type: 'button', class: 'tombol tombol-kecil tombol-sekunder', onClick: batal }, t('umum.batal'))));
    queueMicrotask(() => kode.focus());
    return tr;
  }

  /* -------------------------------- Unit -------------------------------- */
  function bagianUnit(u, ui) {
    const nama = h('input', { type: 'text', value: u.nama, maxlength: BATAS.TEKS_PENDEK, 'aria-label': t('atpEditor.namaUnit', { no: u.no }),
      onChange: (e) => { draft.unit[ui].nama = bersihkanTeks(e.target.value, BATAS.TEKS_PENDEK) || u.nama; berubah(); } });
    const elemen = h('select', {
      'aria-label': t('atpEditor.elemenUnit', { no: u.no }),
      onChange: (e) => { draft.unit[ui].elemen = e.target.value; berubah(); }
    }, draft.cp.map((item) => h('option', {
      value: item.elemen,
      selected: item.elemen === u.elemen,
    }, item.elemen)));
    const semester = h('select', { 'aria-label': t('atpEditor.semesterUnit', { no: u.no }), onChange: (e) => { draft.unit[ui].semester = Number(e.target.value); berubah(); } },
      h('option', { value: 1, selected: u.semester === 1 }, t('umum.ganjil')),
      h('option', { value: 2, selected: u.semester === 2 }, t('umum.genap')));

    const baris = u.tp.map((tp, ti) => (sedangUbah && sedangUbah.u === ui && sedangUbah.i === ti
      ? barisUbah(u, ui, tp, ti) : barisLihat(u, ui, tp, ti)));

    return h('section', { class: 'unit-editor' },
      h('div', { class: 'unit-kepala' },
        h('h3', null, `${t('atp.unit')} ${u.no}`), nama, elemen, semester,
        h('button', { type: 'button', class: 'tombol tombol-kecil tombol-bahaya', disabled: sedangUbah !== null,
          onClick: () => { draft.unit.splice(ui, 1); renumber(); berubah(); } }, t('atpEditor.hapusUnit'))),
      h('div', { class: 'tabel-bungkus' },
        h('table', { class: 'tbl' },
          h('caption', { class: 'sr-saja' }, t('atpEditor.tabelUnit', { no: u.no, nama: u.nama })),
          h('thead', null, h('tr', null,
            h('th', { scope: 'col' }, t('atp.kode')), h('th', { scope: 'col' }, t('atp.tp')),
            h('th', { scope: 'col' }, t('atp.materi')), h('th', { scope: 'col' }, t('atp.jp')),
            h('th', { scope: 'col' }, t('umum.aksi')))),
          h('tbody', null, baris.length ? baris : h('tr', null, h('td', { colspan: 5, class: 'kosong' }, t('atpEditor.unitKosong')))))),
      h('button', { type: 'button', class: 'tombol tombol-kecil tombol-sekunder', disabled: sedangUbah !== null || u.tp.length >= BATAS.TP_MAKS,
        onClick: () => {
          draft.unit[ui].tp.push({ kode: '', rumusan: '', materi: '', jp: 1 });
          sedangUbah = { u: ui, i: draft.unit[ui].tp.length - 1, baru: true };
          gambar();
        } }, `+ ${t('atpEditor.tambahTp')}`));
  }

  function gambar() {
    kosongkan(akar);
    akar.append(ringkasan(), ...draft.unit.map(bagianUnit),
      h('button', { type: 'button', class: 'tombol tombol-sekunder', disabled: sedangUbah !== null || draft.unit.length >= BATAS.UNIT_MAKS,
        onClick: () => {
          const akhir = draft.unit[draft.unit.length - 1];
          draft.unit.push({
            no: draft.unit.length + 1,
            nama: t('atpEditor.unitBaru'),
            elemen: akhir?.elemen ?? draft.cp[0]?.elemen ?? '',
            semester: akhir?.semester ?? 1,
            tp: [],
          });
          berubah();
        } }, `+ ${t('atpEditor.tambahUnit')}`));
  }

  gambar();
  return { el: akar, ambil: () => structuredClone(draft) };
}
