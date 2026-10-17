// web/src/components/toast.js
/**
 * toast.js — Notifikasi non-blocking (satu-satunya sumber toast di aplikasi).
 *
 * Jenis kanonik : 'info' | 'success' | 'warning' | 'error'
 * Alias lama    : 'ok' → success, 'galat' → error, 'peringatan' → warning
 *
 * Anti-duplikat: pesan dengan jenis yang sama dalam 1.5 detik dilebur.
 * Jeda hover/focus: timer dijeda saat kursor/fokus di atas toast (WCAG 2.2.1).
 *
 * Struktur HTML:
 *   <div class="ale-toast ale-toast--success ale-toast--masuk">
 *     <span class="ale-toast__ikon"><svg …/></span>
 *     <span class="ale-toast__teks">…</span>
 *     <button class="ale-toast__tutup" aria-label="Tutup">&times;</button>
 *   </div>
 *
 * Kelas CSS ada di tema Anda (.ale-toast-wadah, .ale-toast, .ale-toast--masuk,
 * .ale-toast--keluar). Kalau belum, lihat Lampiran di bawah.
 */

const ALIAS = {
  ok: 'success',
  galat: 'error',
  peringatan: 'warning',
};

const DURASI_DEFAULT = {
  success: 3000,
  info: 4000,
  warning: 6000,
  error: 8000,
};

const MAKS_TAMPIL = 4;
const DEBOUNCE_MS = 1500;

const IKON = {
  success: '<path d="M20 6L9 17l-5-5"/>',
  info:    '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  warning: '<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17h.01"/>',
  error:   '<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>',
};

let wadah = null;

/** Map "jenis|pesan" → { ts, tutup } untuk debounce & referensi tutup manual. */
const aktif = new Map();

function pastikanWadah() {
  if (wadah && document.body.contains(wadah)) return wadah;
  wadah = document.createElement('div');
  wadah.id = 'ale-toast-wadah';
  wadah.className = 'ale-toast-wadah';
  wadah.setAttribute('role', 'status');
  wadah.setAttribute('aria-live', 'polite');
  wadah.setAttribute('aria-atomic', 'false');
  document.body.appendChild(wadah);
  return wadah;
}

function normalisasiJenis(j) {
  const k = String(j || 'info').toLowerCase();
  const alias = ALIAS[k] || k;
  return Object.prototype.hasOwnProperty.call(IKON, alias) ? alias : 'info';
}

function ambilDurasi(arg3, jenis) {
  if (typeof arg3 === 'number' && arg3 >= 0) return arg3;
  if (arg3 && typeof arg3 === 'object' && typeof arg3.durasi === 'number') {
    return arg3.durasi;
  }
  return DURASI_DEFAULT[jenis];
}

/**
 * Menampilkan toast.
 *
 * @param {string} pesan
 * @param {'info'|'success'|'warning'|'error'|'ok'|'galat'|'peringatan'} [jenis='info']
 * @param {number|{durasi?:number}} [arg3]  Angka = durasi (ms); 0 = tetap sampai ditutup.
 * @returns {Function} Fungsi tutup manual.
 */
export function toast(pesan, jenis = 'info', arg3) {
  const teks = String(pesan || '').trim();
  if (!teks) return () => {};

  const tipe = normalisasiJenis(jenis);
  const kunci = `${tipe}|${teks}`;
  const kini = Date.now();

  // Debounce duplikat: kalau toast sama muncul < 1.5 dtk, kembalikan yang aktif.
  const lama = aktif.get(kunci);
  if (lama && (kini - lama.ts) < DEBOUNCE_MS) return lama.tutup;

  const host = pastikanWadah();
  while (host.children.length >= MAKS_TAMPIL) host.firstElementChild.remove();

  const el = document.createElement('div');
  el.className = `ale-toast ale-toast--${tipe}`;
  el.setAttribute('role', tipe === 'error' ? 'alert' : 'status');
  el.innerHTML = `
    <span class="ale-toast__ikon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        ${IKON[tipe]}
      </svg>
    </span>
    <span class="ale-toast__teks"></span>
    <button type="button" class="ale-toast__tutup" aria-label="Tutup pemberitahuan">&times;</button>`;
  // Aman: isi teks lewat textContent, bukan innerHTML.
  el.querySelector('.ale-toast__teks').textContent = teks;

  const total = ambilDurasi(arg3, tipe);
  let sisa = total;
  let mulai = 0;
  let pewaktu = 0;
  let tertutup = false;

  const tutup = () => {
    if (tertutup) return;
    tertutup = true;
    clearTimeout(pewaktu);
    aktif.delete(kunci);
    el.classList.remove('ale-toast--masuk');
    el.classList.add('ale-toast--keluar');
    setTimeout(() => el.remove(), 220);
  };

  const jalan = () => {
    if (!(total > 0) || tertutup) return;
    mulai = Date.now();
    pewaktu = setTimeout(tutup, sisa);
  };

  // Jeda saat kursor/fokus di atas toast agar pesan sempat dibaca (WCAG 2.2.1)
  const jeda = () => {
    if (!pewaktu) return;
    clearTimeout(pewaktu);
    pewaktu = 0;
    sisa = Math.max(1500, sisa - (Date.now() - mulai));
  };

  el.addEventListener('mouseenter', jeda);
  el.addEventListener('mouseleave', jalan);
  el.addEventListener('focusin', jeda);
  el.addEventListener('focusout', jalan);
  el.querySelector('.ale-toast__tutup').addEventListener('click', tutup);

  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('ale-toast--masuk'));

  aktif.set(kunci, { ts: kini, tutup });
  jalan();
  return tutup;
}

/**
 * Helper kompatibilitas: menggantikan `alert(...)` di kode lama.
 *   alertToast('Email atau sandi salah') → toast error.
 */
export function alertToast(pesan, tipe = 'error') {
  return toast(pesan, tipe);
}

// Backward-compat untuk kode non-modul yang mengakses lewat window.
if (typeof window !== 'undefined') {
  window.__ainnoeAlertToToast = (msg, tipe) => alertToast(msg, tipe || 'error');
  window.__ainnoeToast = toast;
}

export default toast;