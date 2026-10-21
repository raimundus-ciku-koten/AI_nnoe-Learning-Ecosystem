// web/src/lib/teks.js
/** Utilitas teks kecil & murni, dipakai bersama oleh tab dan halaman scan. */

const PETA_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape HTML untuk teks maupun nilai atribut. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => PETA_ESC[c]);

/** Huruf kecil, tanpa aksen, tanpa spasi tepi — untuk pencarian. */
export const normal = (s) => String(s ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim();

/** Ganti karakter non-aman agar nama berkas tidak rusak. */
export const namaAman = (s) => String(s ?? '')
  .replace(/[^\w\-.]+/g, '_')
  .replace(/^_+|_+$/g, '') || 'berkas';
