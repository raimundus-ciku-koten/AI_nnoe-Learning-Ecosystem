// src/core/dom.js
/**
 * dom.js — Helper pembuat elemen DOM yang aman (anti-XSS).
 * Dipakai oleh semua view chat dan (opsional) halaman lain.
 * Selalu memakai textContent, bukan innerHTML, untuk isi pengguna.
 */

/** Membuat elemen dengan props + children. */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);

  for (const [key, value] of Object.entries(props || {})) {
    if (value === false || value === null || value === undefined) continue;
    if (key === 'class' || key === 'className') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, value);
  }

  for (const child of children.flat(Infinity)) {
    if (child === null || child === false || child === undefined) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export const qs  = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Inisial dari nama: "Maria Lestari" → "ML". */
export function initials(name = '') {
  return String(name).trim().split(/\s+/).slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '').join('') || '';
}

/** Jam saja: "14:30". */
export function formatTime(ts) {
  if (!ts) return '';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

/** Hari: kalau hari ini → jam, kalau bukan → "12 Okt". */
export function formatDay(ts) {
  if (!ts) return '';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  const today = new Date();
  const sameDay =
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();
  return sameDay
    ? formatTime(ts)
    : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}