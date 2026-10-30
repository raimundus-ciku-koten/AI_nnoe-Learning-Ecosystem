/**
 * @file Komponen dokumen yang dipakai semua perangkat ajar: kop, identitas, tanda tangan.
 * Semua teks lewat h()/textContent — aman dari XSS.
 */

import { h } from '../dom.js';
import { t } from '../../i18n/index.js';

function tautanKopAman(nilai) {
  if (typeof nilai !== 'string' || !nilai.trim()) return '';
  try {
    const url = new URL(nilai);
    const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL;
    const originDiizinkan = supabaseUrl ? new URL(supabaseUrl).origin : '';
    const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
    if (url.username || url.password || (url.protocol !== 'https:' && !localHttp) ||
      (originDiizinkan && url.origin !== originDiizinkan)) return '';
    return url.href;
  } catch {
    return '';
  }
}

/** Kop dokumen. @param {Object} k konteks paket @param {string} judul */
export function kopDokumen(k, judul) {
  const id = k.identitas ?? {};
  const image = tautanKopAman(id.kopSuratUrl);
  return h('header', { class: 'kop' },
    image
      ? h('img', {
        class: 'kop-gambar',
        src: image,
        alt: `Kop resmi ${id.sekolah || 'sekolah'}`,
        loading: 'eager',
        referrerpolicy: 'no-referrer',
      })
      : h('div', { class: 'kop-teks' },
        id.sekolah ? h('p', { class: 'kop-sekolah' }, id.sekolah) : null,
        id.npsn ? h('p', { class: 'kop-npsn' }, `NPSN ${id.npsn}`) : null,
        id.alamat ? h('p', { class: 'kop-alamat' }, id.alamat) : null),
    h('h1', { class: 'kop-judul' }, judul),
    h('p', { class: 'kop-sub' }, `${k.mapel} · ${t('umum.kelas')} ${k.kelas} · ${t('umum.fase')} ${k.fase} · ${k.tahunAjaran}`));
}

/**
 * Tabel identitas dua kolom (label | nilai).
 * @param {Object} k konteks
 * @param {Array<[string, any]>} [tambahan] baris tambahan [label, nilai]
 */
export function tabelIdentitas(k, tambahan = []) {
  const id = k.identitas ?? {};
  const baris = [
    [t('identitas.sekolah'), id.sekolah],
    [t('identitas.npsn'), id.npsn],
    [t('identitas.alamat'), id.alamat],
    [t('identitas.guru'), id.guru],
    [t('identitas.mapel'), k.mapel],
    [t('identitas.kelasFase'), `${k.kelas} / ${t('umum.fase')} ${k.fase}`],
    [t('identitas.tahunAjaran'), k.tahunAjaran],
    ...tambahan
  ].filter(([, v]) => v !== undefined && v !== null && v !== '');
  return h('table', { class: 'tbl tbl-identitas' },
    h('caption', { class: 'sr-saja' }, t('identitas.judul')),
    h('tbody', null, baris.map(([l, v]) => h('tr', null, h('th', { scope: 'row' }, l), h('td', null, String(v))))));
}

/** Blok tanda tangan kepala sekolah & guru. @param {Object} k konteks */
export function blokTtd(k) {
  const id = k.identitas ?? {};
  const kolom = (jabatan, nama, nip) => h('div', { class: 'ttd-kolom' },
    h('p', null, jabatan),
    h('div', { class: 'ttd-ruang', 'aria-hidden': 'true' }),
    h('p', { class: 'ttd-nama' }, nama || '………………………'),
    nip ? h('p', null, `${t('identitas.nip')}. ${nip}`) : null);
  const jabatanKepala = id.sekolah ? `Mengetahui, Kepala ${id.sekolah}` : t('ttd.kepsek');
  return h('footer', { class: 'ttd' },
    id.lokasi ? h('p', { class: 'ttd-lokasi' }, `${id.lokasi},`) : null,
    h('div', { class: 'ttd-baris' },
      kolom(jabatanKepala, id.kepsek, id.nipKepsek),
      kolom(t('ttd.guru'), id.guru, id.nipGuru)));
}

/** Kotak peringatan non-modal di dalam dokumen/panel. */
export const peringatan = (pesan, jenis = 'peringatan') =>
  h('p', { class: `kotak kotak-${jenis}`, role: jenis === 'galat' ? 'alert' : 'note' }, pesan);
