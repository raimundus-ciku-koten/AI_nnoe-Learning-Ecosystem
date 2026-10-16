/**
 * @file Formulir konteks paket (mapel, kelas, kalender, identitas) dalam <dialog>.
 * - Validasi langsung memakai validasiKonteks (aturan sama dengan sebelum tulis ke Firestore).
 * - Galat dikaitkan ke kolom lewat aria-describedby/aria-invalid; fokus pindah ke galat pertama.
 */

import { h, dialog } from './dom.js';
import { t } from '../i18n/index.js';
import { NAMA_HARI, BATAS } from '../constants.js';
import { validasiKonteks } from '../engine/validator.js';

/** Nilai awal. Tanggal contoh mengikuti bawaan di GAS; guru wajib memeriksanya. */
export const KONTEKS_BAWAAN = Object.freeze({
  mapel: '', kelas: '', fase: 'E', tahunAjaran: '2026/2027',
  jpPerPekan: 4, totalJP: null, hariPembelajaran: [],
  ganjil: { mulai: '2026-07-13', selesai: '2026-12-19' },
  genap: { mulai: '2027-01-05', selesai: '2027-06-19' },
  kalender: [],
  identitas: { sekolah: '', guru: '', nipGuru: '', kepsek: '', nipKepsek: '', lokasi: '' }
});

let hitungId = 0;

/**
 * @param {Object} o
 * @param {string} o.judul
 * @param {Object} [o.awal] konteks awal (mengikuti bentuk KONTEKS_BAWAAN)
 * @param {(konteks:Object) => Promise<void>} o.onSimpan  melempar galat → ditampilkan di formulir
 */
export function bukaFormPaket({ judul, awal = KONTEKS_BAWAAN, onSimpan }) {
  const A = structuredClone(awal);
  A.identitas = { ...KONTEKS_BAWAAN.identitas, ...(A.identitas ?? {}) };
  const uid = `fp${++hitungId}`;
  const refGalat = {};

  /** Satu kolom: label + kontrol + hint + pesan galat. */
  const kolom = (nama, label, kontrol, { hint, lebar } = {}) => {
    const idGalat = `${uid}-${nama}-g`;
    const idHint = `${uid}-${nama}-h`;
    kontrol.id = `${uid}-${nama}`;
    kontrol.setAttribute('aria-describedby', [hint ? idHint : '', idGalat].filter(Boolean).join(' '));
    const pesan = h('p', { class: 'galat-kolom', id: idGalat, role: 'alert' });
    refGalat[nama] = { pesan, kontrol };
    return h('div', { class: `kolom ${lebar ?? ''}` },
      h('label', { for: kontrol.id }, label),
      kontrol,
      hint ? h('p', { class: 'hint', id: idHint }, hint) : null,
      pesan);
  };

  const input = (nama, tipe, nilai, extra = {}) => h('input', { type: tipe, name: nama, value: nilai ?? '', autocomplete: 'off', ...extra });

  const mapel = input('mapel', 'text', A.mapel, { maxlength: BATAS.TEKS_PENDEK, required: true });
  const kelas = input('kelas', 'text', A.kelas, { maxlength: 20, required: true, placeholder: 'X' });
  const fase = h('select', { name: 'fase' }, ['A', 'B', 'C', 'D', 'E', 'F'].map((f) => h('option', { value: f, selected: f === A.fase }, f)));
  const ta = input('tahunAjaran', 'text', A.tahunAjaran, { maxlength: 9, placeholder: '2026/2027', pattern: '\\d{4}/\\d{4}' });
  const jp = input('jpPerPekan', 'number', A.jpPerPekan, { min: BATAS.JP_PER_PEKAN_MIN, max: BATAS.JP_PER_PEKAN_MAX, step: 1, inputmode: 'numeric', required: true });
  const totalJP = input('totalJP', 'number', A.totalJP ?? '', { min: BATAS.TOTAL_JP_MIN, max: BATAS.TOTAL_JP_MAX, step: 1, inputmode: 'numeric' });

  const cekHari = [1, 2, 3, 4, 5, 6].map((i) => h('label', { class: 'cek' },
    h('input', { type: 'checkbox', name: 'hari', value: i, checked: (A.hariPembelajaran ?? []).includes(i) }), NAMA_HARI[i]));
  const grupHari = h('fieldset', { class: 'grup-hari' }, h('legend', null, t('form.hari')), h('div', { class: 'baris-cek' }, cekHari),
    h('p', { class: 'galat-kolom', role: 'alert', id: `${uid}-hari-g` }));

  const tgl = (nama, nilai) => input(nama, 'date', nilai, { required: true });
  const gm = tgl('ganjilMulai', A.ganjil.mulai);
  const gs = tgl('ganjilSelesai', A.ganjil.selesai);
  const nm = tgl('genapMulai', A.genap.mulai);
  const ns = tgl('genapSelesai', A.genap.selesai);

  const id = A.identitas;
  const idInput = (nama, nilai, maks = BATAS.TEKS_PENDEK) => input(nama, 'text', nilai, { maxlength: maks });
  const sekolah = idInput('sekolah', id.sekolah);
  const guru = idInput('guru', id.guru);
  const nipGuru = idInput('nipGuru', id.nipGuru, 30);
  const kepsek = idInput('kepsek', id.kepsek);
  const nipKepsek = idInput('nipKepsek', id.nipKepsek, 30);
  const lokasi = idInput('lokasi', id.lokasi);

  /* ------------------------------ Kalender ------------------------------ */
  const barisKal = h('div', { class: 'kal-daftar' });
  const galatKal = h('p', { class: 'galat-kolom', role: 'alert', id: `${uid}-kalender-g` });
  const tambahBaris = (e = { mulai: '', selesai: '', ket: '', efektif: false }) => {
    const baris = h('div', { class: 'kal-baris' },
      h('input', { type: 'date', 'aria-label': t('form.kalMulai'), value: e.mulai, required: true, name: 'kalMulai' }),
      h('input', { type: 'date', 'aria-label': t('form.kalSelesai'), value: e.selesai ?? '', name: 'kalSelesai' }),
      h('input', { type: 'text', 'aria-label': t('form.kalKet'), value: e.ket ?? '', maxlength: BATAS.TEKS_PENDEK, placeholder: t('form.kalKet'), name: 'kalKet' }),
      h('select', { 'aria-label': t('form.kalJenis'), name: 'kalJenis' },
        h('option', { value: 'tidak', selected: !e.efektif }, t('form.kalTidakEfektif')),
        h('option', { value: 'efektif', selected: e.efektif }, t('form.kalEfektif'))),
      h('button', { type: 'button', class: 'tombol-ikon', 'aria-label': t('umum.hapus'), onClick: () => baris.remove() }, '×'));
    barisKal.append(baris);
  };
  (A.kalender ?? []).forEach(tambahBaris);

  /* ------------------------------ Susun form ------------------------------ */
  const status = h('p', { class: 'galat-form', role: 'alert' });
  const tombolSimpan = h('button', { type: 'submit', class: 'tombol' }, t('umum.simpan'));
  const form = h('form', { class: 'form-paket', novalidate: true },
    h('fieldset', null, h('legend', null, t('form.bagianMapel')),
      h('div', { class: 'grid-form' },
        kolom('mapel', t('form.mapel'), mapel, { lebar: 'lebar-2' }),
        kolom('kelas', t('form.kelas'), kelas),
        kolom('fase', t('form.fase'), fase),
        kolom('tahunAjaran', t('form.tahunAjaran'), ta),
        kolom('jpPerPekan', t('form.jpPerPekan'), jp),
        kolom('totalJP', t('form.totalJP'), totalJP, { hint: t('form.totalJPHint') }))),
    h('fieldset', null, h('legend', null, t('form.bagianJadwal')), grupHari,
      h('div', { class: 'grid-form' },
        kolom('ganjilMulai', t('form.ganjilMulai'), gm), kolom('ganjilSelesai', t('form.ganjilSelesai'), gs),
        kolom('genapMulai', t('form.genapMulai'), nm), kolom('genapSelesai', t('form.genapSelesai'), ns))),
    h('fieldset', null, h('legend', null, t('form.bagianKalender')),
      h('p', { class: 'hint' }, t('form.kalenderHint')), barisKal, galatKal,
      h('button', { type: 'button', class: 'tombol tombol-sekunder tombol-kecil', onClick: () => tambahBaris() }, `+ ${t('form.tambahKalender')}`)),
    h('fieldset', null, h('legend', null, t('form.bagianIdentitas')),
      h('div', { class: 'grid-form' },
        kolom('sekolah', t('identitas.sekolah'), sekolah, { lebar: 'lebar-2' }),
        kolom('guru', t('identitas.guru'), guru), kolom('nipGuru', t('identitas.nip'), nipGuru),
        kolom('kepsek', t('identitas.kepsek'), kepsek), kolom('nipKepsek', t('identitas.nipKepsek'), nipKepsek),
        kolom('lokasi', t('identitas.lokasi'), lokasi))),
    status,
    h('div', { class: 'dlg-aksi' },
      h('button', { type: 'button', class: 'tombol tombol-sekunder', onClick: () => tutup() }, t('umum.batal')), tombolSimpan));

  /** Kumpulkan nilai mentah dari kontrol. */
  const kumpulkan = () => ({
    mapel: mapel.value, kelas: kelas.value, fase: fase.value, tahunAjaran: ta.value,
    jpPerPekan: jp.value, totalJP: totalJP.value,
    hariPembelajaran: cekHari.map((l) => l.firstChild).filter((c) => c.checked).map((c) => Number(c.value)),
    ganjilMulai: gm.value, ganjilSelesai: gs.value, genapMulai: nm.value, genapSelesai: ns.value,
    sekolah: sekolah.value, guru: guru.value, nipGuru: nipGuru.value, kepsek: kepsek.value, nipKepsek: nipKepsek.value, lokasi: lokasi.value,
    kalender: [...barisKal.children].map((b) => ({
      mulai: b.querySelector('[name=kalMulai]').value,
      selesai: b.querySelector('[name=kalSelesai]').value,
      ket: b.querySelector('[name=kalKet]').value,
      efektif: b.querySelector('[name=kalJenis]').value === 'efektif'
    })).filter((e) => e.mulai || e.selesai || e.ket)
  });

  const bersihkanGalat = () => {
    Object.values(refGalat).forEach(({ pesan, kontrol }) => { pesan.textContent = ''; kontrol.removeAttribute('aria-invalid'); });
    galatKal.textContent = ''; status.textContent = '';
    form.querySelector(`#${uid}-hari-g`).textContent = '';
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    bersihkanGalat();
    const mentah = kumpulkan();
    const hasil = validasiKonteks(mentah);
    const galat = { ...hasil.galat };
    if (mentah.hariPembelajaran.length === 0) galat.hariPembelajaran = 'PILIH_HARI';

    const pertama = [];
    for (const [k, kode] of Object.entries(galat)) {
      const teksGalat = t(`galat.${kode}`);
      if (k === 'kalender') { galatKal.textContent = teksGalat; continue; }
      if (k === 'hariPembelajaran') { form.querySelector(`#${uid}-hari-g`).textContent = teksGalat; pertama.push(cekHari[0].firstChild); continue; }
      const r = refGalat[k];
      if (r) { r.pesan.textContent = teksGalat; r.kontrol.setAttribute('aria-invalid', 'true'); pertama.push(r.kontrol); }
    }
    if (Object.keys(galat).length) {
      status.textContent = t('form.periksaIsian');
      (pertama[0] ?? form).focus?.();
      return;
    }

    tombolSimpan.disabled = true;
    tombolSimpan.setAttribute('aria-busy', 'true');
    try {
      const { nilai } = hasil;
      await onSimpan({
        mapel: nilai.mapel, kelas: nilai.kelas, fase: nilai.fase, tahunAjaran: nilai.tahunAjaran,
        jpPerPekan: nilai.jpPerPekan, totalJP: nilai.totalJP,
        hariPembelajaran: mentah.hariPembelajaran.sort((a, b) => a - b),
        ganjil: nilai.ganjil, genap: nilai.genap, kalender: nilai.kalender, identitas: nilai.identitas
      });
      tutup();
    } catch (err) {
      status.textContent = t(`galat.${err?.kode ?? 'UMUM'}`);
      tombolSimpan.disabled = false;
      tombolSimpan.removeAttribute('aria-busy');
    }
  });

  const { tutup } = dialog(judul, form);
}
