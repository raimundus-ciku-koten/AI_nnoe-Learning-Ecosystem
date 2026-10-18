// web/src/utils/dom.js
/**
 * dom.js — Helper DOM minimalis untuk view yang memakai gaya hyperscript.
 *
 * Menggantikan `src/core/dom.js`. Semua view di `src/views/chat/*` mengimpor
 * dari sini:
 *   - h()           → buat elemen (aman, pakai textContent untuk anak teks)
 *   - clear()       → kosongkan isi elemen tanpa innerHTML = ''
 *   - initials()    → "Maria Lestari" → "ML"
 *   - formatTime()  → Timestamp/Date → "14:30"
 *   - formatDay()   → hari ini → jam, selain → "12 Okt"
 *   - qs() / qsa()  → querySelector / querySelectorAll (opsional)
 */

/**
 * Buat elemen DOM.
 *
 *   h('div', { class: 'x', onClick: fn }, 'teks', childNode, ...)
 *
 * Aturan props:
 *   - null | undefined | false → diabaikan
 *   - class / className        → el.className
 *   - style (objek)            → Object.assign(el.style, …)
 *   - dataset (objek)          → Object.assign(el.dataset, …)
 *   - html                     → el.innerHTML (hati-hati, hanya untuk tepercaya)
 *   - on* (fungsi)             → addEventListener (nama event lowercase)
 *   - true                     → atribut kosong (mis. `disabled`)
 *   - selain itu               → setAttribute
 *
 * Anak bisa berupa: Node, string, number, atau array/nested array.
 * null / undefined / false akan dilewati (memudahkan conditional rendering).
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);

  if (attrs && typeof attrs === 'object') {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;

      if (k === 'class' || k === 'className') {
        el.className = v;
      } else if (k === 'style' && typeof v === 'object') {
        Object.assign(el.style, v);
      } else if (k === 'dataset' && typeof v === 'object') {
        Object.assign(el.dataset, v);
      } else if (k === 'html') {
        el.innerHTML = v;
      } else if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else {
        el.setAttribute(k, v === true ? '' : v);
      }
    }
  }

  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Query selector tunggal. */
export const qs  = (sel, root = document) => root.querySelector(sel);

/** Query selector ganda → array. */
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Kosongkan isi elemen (tanpa innerHTML = '' demi performa & keamanan). */
export function clear(el) {
  if (!el) return el;
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/** Ambil inisial nama (maksimal 2 huruf kapital). Contoh: "Maria Lestari" → "ML". */
export function initials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/).slice(0, 2);
  const out = parts.map((w) => w[0]?.toUpperCase() || '').join('');
  return out || '?';
}

/** Jam saja: "14:30". Menerima objek timestamp, Date, number, atau string. */
export function formatTime(ts) {
  if (!ts) return '';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Tanggal ringkas untuk daftar percakapan:
 *   hari ini → jam ("14:30")
 *   selain   → "12 Okt"
 */
export function formatDay(ts) {
  if (!ts) return '';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  const sameDay =
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();
  return sameDay
    ? formatTime(ts)
    : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}