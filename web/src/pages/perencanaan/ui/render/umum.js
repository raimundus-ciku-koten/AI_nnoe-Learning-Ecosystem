/**
 * @file Komponen dokumen yang dipakai semua perangkat ajar: kop, identitas, tanda tangan.
 * Semua teks lewat h()/textContent — aman dari XSS.
 */

import { h } from '../dom.js';
import { t } from '../../i18n/index.js';

/** Kop dokumen. @param {Object} k konteks paket @param {string} judul */
export function kopDokumen(k, judul) {
  const kopDataUrl = k.identitas?.kopDataUrl;
  const gambarKopAman = typeof kopDataUrl === 'string' &&
    /^data:image\/(?:png|jpeg|webp);base64,/.test(kopDataUrl);
  return h('header', { class: 'kop' },
    gambarKopAman
      ? h('img', { class: 'kop-gambar', src: kopDataUrl, alt: `Kop ${k.identitas?.sekolah || 'sekolah'}` })
      : k.identitas?.sekolah ? h('p', { class: 'kop-sekolah' }, k.identitas.sekolah) : null,
    h('h1', { class: 'kop-judul' }, judul),
    h('p', { class: 'kop-sub', 'data-review-locked': 'true' },
      `${k.mapel} · ${t('umum.kelas')} ${k.kelas} · ${t('umum.fase')} ${k.fase} · ${k.tahunAjaran}`));
}

/**
 * Tabel identitas dua kolom (label | nilai).
 * @param {Object} k konteks
 * @param {Array<[string, any]>} [tambahan] baris tambahan [label, nilai]
 */
export function tabelIdentitas(k, tambahan = []) {
  const id = k.identitas ?? {};
  const baris = [
    [t('identitas.sekolah'), id.sekolah, false],
    [t('identitas.guru'), id.guru, true],
    [t('identitas.mapel'), k.mapel, false],
    [t('identitas.kelasFase'), `${k.kelas} / ${t('umum.fase')} ${k.fase}`, false],
    [t('identitas.tahunAjaran'), k.tahunAjaran, true],
    ...tambahan
  ].map(([label, value, terkunci = false]) => [
    label,
    value,
    terkunci || [t('identitas.guru'), t('identitas.tahunAjaran')].includes(label),
  ]).filter(([, value]) => value !== undefined && value !== null && value !== '');
  return h('table', { class: 'tbl tbl-identitas' },
    h('caption', { class: 'sr-saja' }, t('identitas.judul')),
    h('tbody', null, baris.map(([label, value, terkunci]) => h('tr', null,
      h('th', { scope: 'row', 'data-review-locked': terkunci ? 'true' : null }, label),
      h('td', { 'data-review-locked': terkunci ? 'true' : null }, String(value))))));
}

/** Blok tanda tangan kepala sekolah & guru. @param {Object} k konteks */
export function blokTtd(k) {
  const id = k.identitas ?? {};
  const kolom = (jabatan, nama, nip) => h('div', { class: 'ttd-kolom' },
    h('p', { 'data-review-locked': 'true' }, jabatan),
    h('div', { class: 'ttd-ruang', 'aria-hidden': 'true' }),
    h('p', { class: 'ttd-nama', 'data-review-locked': 'true' }, nama || '………………………'),
    nip ? h('p', { 'data-review-locked': 'true' }, `${t('identitas.nip')}. ${nip}`) : null);
  return h('footer', { class: 'ttd' },
    id.lokasi ? h('p', { class: 'ttd-lokasi' }, `${id.lokasi},`) : null,
    h('div', { class: 'ttd-baris' },
      kolom(t('ttd.kepsek'), id.kepsek, id.nipKepsek),
      kolom(t('ttd.guru'), id.guru, id.nipGuru)));
}

/** Kotak peringatan non-modal di dalam dokumen/panel. */
export const peringatan = (pesan, jenis = 'peringatan') =>
  h('p', { class: `kotak kotak-${jenis}`, role: jenis === 'galat' ? 'alert' : 'note' }, pesan);
