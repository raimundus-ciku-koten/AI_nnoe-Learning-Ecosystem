/**
 * @file Pembangun DOM yang AMAN secara bawaan.
 * Tidak ada innerHTML: semua teks masuk lewat createTextNode/textContent, sehingga data dari
 * pengguna maupun AI tidak pernah dieksekusi sebagai HTML (mencegah XSS).
 */

import { t } from '../i18n/index.js';

/**
 * Buat elemen.
 * - `class` / `kelas`: string
 * - `on<Peristiwa>`: fungsi
 * - `dataset`: objek
 * - atribut boolean: true → atribut ada, false/null/undefined → dilewati
 * @param {string} tag
 * @param {Record<string, any>|null} [attrs]
 * @param {...(Node|string|number|null|undefined|false|Array<any>)} anak
 * @returns {HTMLElement}
 */
export function h(tag, attrs, ...anak) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class' || k === 'kelas') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html' || k === 'innerHTML') throw new Error('innerHTML dilarang.');
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  tambahAnak(el, anak);
  return el;
}

function tambahAnak(el, anak) {
  for (const a of anak) {
    if (a === null || a === undefined || a === false) continue;
    if (Array.isArray(a)) tambahAnak(el, a);
    else el.append(a instanceof Node ? a : document.createTextNode(String(a)));
  }
}

/** Kosongkan elemen dengan aman. */
export const kosongkan = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

/**
 * Tabel aksesibel.
 * @param {Object} o
 * @param {string} o.caption  judul tabel (dibaca pembaca layar)
 * @param {Array<string|{teks:any, kelas?:string, colspan?:number}>} o.kepala
 * @param {Array<Array<any|{teks:any, rowspan?:number, colspan?:number, kelas?:string, th?:boolean}>>} o.baris
 * @param {string} [o.kelas]
 */
export function tabel({ caption, kepala, baris, kelas = '' }) {
  const thead = h('thead', null, h('tr', null, kepala.map((k) => {
    const o = typeof k === 'object' && k !== null && !(k instanceof Node) ? k : { teks: k };
    return h('th', { scope: 'col', class: o.kelas, colspan: o.colspan }, o.teks);
  })));
  const tbody = h('tbody', null, baris.map((b) => h('tr', { class: b.kelas }, b.map((sel) => {
    const o = typeof sel === 'object' && sel !== null && !(sel instanceof Node) && 'teks' in sel ? sel : { teks: sel };
    return h(o.th ? 'th' : 'td', {
      class: o.kelas, rowspan: o.rowspan, colspan: o.colspan, scope: o.th ? 'row' : null
    }, o.teks);
  }))));
  return h('div', { class: 'tabel-bungkus' },
    h('table', { class: `tbl ${kelas}`.trim() }, h('caption', null, caption), thead, tbody));
}

/* ------------------------------- Toast ------------------------------- */

let wadahToast = null;

/**
 * Pesan singkat non-modal. Wadah `aria-live` agar terbaca pembaca layar.
 * @param {string} pesan
 * @param {'info'|'sukses'|'galat'} [jenis]
 */
export function toast(pesan, jenis = 'info') {
  if (!wadahToast || !document.body.contains(wadahToast)) {
    wadahToast = h('div', { class: 'toast-wadah no-print', role: 'status', 'aria-live': 'polite' });
    document.body.append(wadahToast);
  }
  const el = h('div', { class: `toast toast-${jenis}` }, pesan);
  wadahToast.append(el);
  setTimeout(() => el.remove(), jenis === 'galat' ? 8000 : 4000);
}

/* ------------------------------ Dialog ------------------------------- */

/**
 * Dialog konfirmasi berbasis <dialog> (fokus terkunci & Esc ditangani peramban).
 * @param {string} pesan
 * @param {{ya?:string, tidak?:string, bahaya?:boolean}} [opsi]
 * @returns {Promise<boolean>}
 */
export function konfirmasi(pesan, opsi = {}) {
  return new Promise((selesai) => {
    const dlg = h('dialog', { class: 'dlg', 'aria-label': pesan },
      h('form', { method: 'dialog', class: 'dlg-isi' },
        h('p', null, pesan),
        h('div', { class: 'dlg-aksi' },
          h('button', { value: 'tidak', class: 'tombol tombol-sekunder' }, opsi.tidak ?? t('umum.batal')),
          h('button', { value: 'ya', class: `tombol ${opsi.bahaya ? 'tombol-bahaya' : ''}`, autofocus: true }, opsi.ya ?? t('umum.ya')))));
    dlg.addEventListener('close', () => { selesai(dlg.returnValue === 'ya'); dlg.remove(); });
    document.body.append(dlg);
    dlg.showModal();
  });
}

/**
 * Buka dialog dengan isi bebas. Mengembalikan { dlg, tutup }.
 * @param {string} judul
 * @param {Node} isi
 * @param {() => void} [saatTutup]
 */
export function dialog(judul, isi, saatTutup) {
  const dlg = h('dialog', { class: 'dlg dlg-lebar', 'aria-labelledby': 'dlg-judul' },
    h('div', { class: 'dlg-isi' },
      h('div', { class: 'dlg-kepala' },
        h('h2', { id: 'dlg-judul' }, judul),
        h('button', { type: 'button', class: 'tombol-ikon', 'aria-label': t('umum.tutup'), onClick: () => dlg.close() }, '×')),
      isi));
  dlg.addEventListener('close', () => { saatTutup?.(); dlg.remove(); });
  document.body.append(dlg);
  dlg.showModal();
  return { dlg, tutup: () => dlg.close() };
}

/** Format bilangan sesuai lokal. @param {number} n */
export const angka = (n) => new Intl.NumberFormat('id-ID').format(n);
