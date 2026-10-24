// web/src/components/loading.js
/**
 * loading.js — Overlay loading global.
 * Menggantikan: showAiLoading() + #aiLoadingOverlay.
 *
 * Pemakaian (kompatibel dengan versi lama):
 *   showLoading('Menyusun ATP…');          // pesan tetap
 *   showLoading(null, 'ATP');              // "Menyusun ATP…" lalu pesan bergilir
 *   hideLoading();                         // tutup SEMUA permintaan loading
 *
 * Pemakaian baru (disarankan):
 *   const selesai = showLoading(null, 'ATP');
 *   try { ... } finally { selesai(); }     // hanya melepas permintaan miliknya
 *
 *   const hasil = await withLoading(() => buatDokumen(), null, 'Modul');
 *
 * Peningkatan dibanding versi sebelumnya:
 *   - Beberapa proses bersamaan tidak saling menutup overlay (token per permintaan).
 *   - Fokus keyboard dipindah ke overlay lalu dikembalikan saat selesai (WCAG 2.2).
 *   - Watchdog: overlay otomatis ditutup bila proses macet (default 5 menit).
 *   - Favicon asli aplikasi dipulihkan saat idle, bukan ditimpa selamanya.
 *   - Pesan bergilir berhenti di pesan terakhir (tidak berputar kembali ke awal).
 *   - Menghormati prefers-reduced-motion untuk transisi tutup.
 */
const MESSAGES = [
  'Menghubungkan ke model AI…',
  'Menganalisis konteks mapel & kelas…',
  'Menyusun struktur dokumen…',
  'Menulis isi & tabel…',
  'Menyelaraskan TP, JP, dan asesmen…',
  'Merapikan tipografi dokumen…',
  'Menyiapkan pratinjau…',
  'Hampir selesai…',
];

const JEDA_MINIMUM_MS   = 400;           // cegah overlay berkedip
const INTERVAL_PESAN_MS = 3800;
const BATAS_DEFAULT_MS  = 5 * 60 * 1000; // watchdog

let _overlay = null;
let _judul = null;
let _msgTimer = null;
let _hideTimer = null;
let _startTime = 0;
let _tampil = false;
let _fokusSebelum = null;
let _nomor = 0;

/** Permintaan loading yang masih aktif: token → id timer watchdog. */
const _aktif = new Map();

const kurangiGerak = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function ensureOverlay() {
  if (_overlay && _overlay.isConnected) return _overlay;
  _overlay = document.createElement('div');
  _overlay.className = 'loading-overlay';
  _overlay.setAttribute('role', 'status');
  _overlay.setAttribute('aria-live', 'polite');
  _overlay.setAttribute('aria-label', 'Sedang memproses');
  _overlay.tabIndex = -1;
  _overlay.style.outline = 'none';
  // Judul bergilir disembunyikan dari pembaca layar agar tidak membacakan ulang tiap 4 detik.
  _overlay.innerHTML = `
    <div class="loading-box">
      <img class="loading-logo" src="/logo-ale-mark.png" alt="" width="72" height="72" />
      <h3 id="loading-title" aria-hidden="true">Memproses…</h3>
      <p>Mohon tunggu dan jangan tutup halaman ini.</p>
      <span class="sr-only">Sedang memproses, mohon tunggu.</span>
    </div>
  `;
  _judul = _overlay.querySelector('#loading-title');
  document.body.appendChild(_overlay);
  return _overlay;
}

// Selama overlay tampil, isi halaman di belakangnya tidak bisa difokuskan lewat keyboard.
function kunciLatar(aktif) {
  Array.from(document.body.children).forEach((el) => {
    if (el === _overlay || el.id === 'toast-stack') return;
    if (aktif) {
      if (!el.hasAttribute('inert')) {
        el.setAttribute('inert', '');
        el.dataset.loadingInert = '1';
      }
    } else if (el.dataset.loadingInert) {
      el.removeAttribute('inert');
      delete el.dataset.loadingInert;
    }
  });
}

function hentikanPesan() {
  if (_msgTimer) { clearInterval(_msgTimer); _msgTimer = null; }
}

function mulaiPesan(awalIndeks) {
  hentikanPesan();
  let i = awalIndeks;
  _msgTimer = setInterval(() => {
    if (i < MESSAGES.length - 1) i += 1;
    _judul.textContent = MESSAGES[i];
    if (i >= MESSAGES.length - 1) hentikanPesan(); // berhenti di "Hampir selesai…"
  }, INTERVAL_PESAN_MS);
}

/**
 * Tampilkan overlay.
 * @param {string|null} [customMsg]  Pesan tetap (tidak digilir).
 * @param {string|null} [menuName]   Nama dokumen → "Menyusun {menuName}…" lalu digilir.
 * @param {{batasMs?: number}} [opsi] batasMs = watchdog (0 = nonaktif).
 * @returns {() => void} fungsi pelepas untuk permintaan ini.
 */
export function showLoading(customMsg, menuName, opsi = {}) {
  const el = ensureOverlay();

  // Batalkan penutupan tertunda; kalau tidak, hideLoading() lama bisa menutup overlay baru.
  if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }

  const token = ++_nomor;
  const batas = Number.isFinite(opsi.batasMs) ? opsi.batasMs : BATAS_DEFAULT_MS;
  const watchdog = batas > 0
    ? setTimeout(() => {
        console.warn('[loading] melewati batas waktu, overlay ditutup otomatis.');
        lepas(token);
      }, batas)
    : null;
  _aktif.set(token, watchdog);

  const awal = customMsg || (menuName ? `Menyusun ${menuName}…` : MESSAGES[0]);
  _judul.textContent = awal;

  if (!_tampil) {
    const f = document.activeElement;
    _fokusSebelum = f instanceof HTMLElement && f !== document.body ? f : null;
    _startTime = Date.now();
  }
  _tampil = true;

  el.classList.add('show');
  kunciLatar(true);
  // Fokus dipindah setelah frame berikutnya agar elemen sudah terlihat (bisa difokuskan).
  requestAnimationFrame(() => { if (_tampil) el.focus({ preventScroll: true }); });

  // Pesan kustom tidak digilir.
  hentikanPesan();
  if (!customMsg) mulaiPesan(0);

  setFavicon('loading');
  return () => lepas(token);
}

/** Lepas satu permintaan; overlay menutup hanya bila tak ada permintaan lain. */
function lepas(token) {
  if (!_aktif.has(token)) return;
  const wd = _aktif.get(token);
  if (wd) clearTimeout(wd);
  _aktif.delete(token);
  if (_aktif.size === 0) tutup();
}

/** Tutup SEMUA permintaan loading (perilaku lama). */
export function hideLoading() {
  _aktif.forEach((wd) => { if (wd) clearTimeout(wd); });
  _aktif.clear();
  tutup();
}

function tutup() {
  if (!_overlay || !_tampil) return;
  const dur = Date.now() - _startTime;
  const delay = kurangiGerak() ? 0 : Math.max(0, JEDA_MINIMUM_MS - dur);

  if (_hideTimer) clearTimeout(_hideTimer);
  _hideTimer = setTimeout(() => {
    _hideTimer = null;
    if (_aktif.size > 0) return; // ada permintaan baru selama jeda
    _tampil = false;
    _overlay.classList.remove('show');
    kunciLatar(false);
    hentikanPesan();
    setFavicon('idle');

    // Kembalikan fokus hanya bila pengguna belum memindahkannya sendiri.
    const f = document.activeElement;
    const fokusHilang = !f || f === document.body || f === _overlay;
    if (fokusHilang && _fokusSebelum && _fokusSebelum.isConnected) {
      _fokusSebelum.focus({ preventScroll: true });
    }
    _fokusSebelum = null;
  }, delay);
}

/** Apakah overlay sedang aktif? */
export function isLoading() {
  return _aktif.size > 0;
}

/**
 * Jalankan tugas (fungsi async atau Promise) dengan overlay otomatis.
 * Overlay selalu dilepas, baik sukses maupun galat.
 */
export async function withLoading(tugas, customMsg, menuName, opsi) {
  const selesai = showLoading(customMsg, menuName, opsi);
  try {
    return await (typeof tugas === 'function' ? tugas() : tugas);
  } finally {
    selesai();
  }
}

// ---------------------------------------------------------------------------
// Favicon dinamis (kompatibel dengan setFaviconState di GAS lama)
// ---------------------------------------------------------------------------
const FAVICON_STATES = {
  idle:    { bg: '#0c4a6e', stroke: '#2dd4bf' },
  loading: { bg: '#0f172a', stroke: '#38bdf8' },
  ok:      { bg: '#064e3b', stroke: '#10b981' },
  error:   { bg: '#7f1d1d', stroke: '#ef4444' },
};

const _cacheFavicon = new Map();
let _asli;   // undefined = belum diambil; null = tidak ada favicon bawaan

function urlFavicon(state) {
  const s = FAVICON_STATES[state] || FAVICON_STATES.idle;
  const kunci = FAVICON_STATES[state] ? state : 'idle';
  if (!_cacheFavicon.has(kunci)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="14" fill="${s.bg}"/>
    <path d="M16 32c0-8 6-14 14-14s14 6 14 14-6 14-14 14-14-6-14-14zm18 0c0-8 6-14 14-14s14 6 14 14-6 14-14 14-14-6-14-14"
          fill="none" stroke="${s.stroke}" stroke-width="5" stroke-linecap="round"/>
  </svg>`;
    _cacheFavicon.set(kunci, 'data:image/svg+xml,' + encodeURIComponent(svg));
  }
  return _cacheFavicon.get(kunci);
}

export function setFavicon(state) {
  let link = document.querySelector('link[rel~="icon"]');
  if (_asli === undefined) {
    _asli = link ? { href: link.getAttribute('href'), type: link.getAttribute('type') } : null;
  }
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }

  // Idle + ada favicon bawaan → pulihkan yang asli.
  if (state === 'idle' && _asli && _asli.href) {
    link.href = _asli.href;
    if (_asli.type) link.type = _asli.type; else link.removeAttribute('type');
    return;
  }
  link.type = 'image/svg+xml';
  link.href = urlFavicon(state);
}
