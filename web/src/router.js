// web/src/router.js
/**
 * router.js — Hash router SPA dengan shell persisten.
 *
 * Mengapa file ini TIDAK di-rewrite jadi tabel RUTE statis:
 *   - main.js dan halaman-halaman mendaftarkan rute lewat daftar(),
 *     bukan hardcode di sini. Ini yang memungkinkan /scan/:kode,
 *     /datadasar/:sub, dan rute dinamis lain tanpa mengedit router.
 *   - Slot konten HARUS bernama #slot-halaman (dipakai sidebar.js &
 *     dashboard.css). Mengganti jadi #isi-utama akan memutus sidebar.
 *   - Struktur shell: topbar di LUAR .app, sidebar + main DI DALAM .app.
 *     Ini wajib karena .app memakai `grid-template-columns` dan
 *     `padding-top: calc(var(--ale-topbar-h) + ...)`.
 *   - Patch 2d (skip render bila hanya query berubah) memungkinkan
 *     halaman dengan sub-tab menangani navigasi internal sendiri,
 *     tanpa re-render penuh. Menghapus ini akan memecahkan tab Data Dasar
 *     versi lama (?tab=profil → ?tab=siswa).
 *
 * API publik:
 *   daftar(path, renderFn, { shell? })   registrasi rute
 *   daftarkan                            alias daftar
 *   navigate(path, { force? })           navigasi programatik
 *   back()                               history.back()
 *   bacaRute()                           { path, query, params } dari hash
 *   render({ force? })                   paksa render ulang
 *   setOnRouteChange(fn)                 hook setelah render
 *   mulaiRouter(wadah?)                  bootstrap
 *
 * Konvensi rute berparameter:
 *   '/datadasar/:sub'           → ctx.params.sub
 *   '/chat/:chatId'             → ctx.params.chatId
 *   '/perencanaan/:id?/:jenis?' → ctx.params.id, ctx.params.jenis (opsional)
 */
import { getState, setState } from './state.js';
import { ROUTES, normalizeHash, bolehAkses } from './routes.js';
import * as sidebarMod from './components/sidebar.js';

// ---------------------------------------------------------------------------
// State internal
// ---------------------------------------------------------------------------
const registry = new Map();
const ruteParam = [];
let onRouteChange = null;
let wadahGlobal = null;
let sedangMerender = false;
let lastRenderedHash = null;
let bersihkan = null;
let ruteTerakhir = null;

// Shell persisten
let shellRoot = null;
let shellUid = null;
const TANPA_SHELL = new Set(['/login', '/daftar', '/lupa-sandi', '/scan']);

// ---------------------------------------------------------------------------
// Registrasi halaman
// ---------------------------------------------------------------------------
/**
 * @param {string} path
 * @param {(wadah:HTMLElement, ctx:object) => (void|Function|Promise<any>)} renderFn
 * @param {{ shell?: boolean }} [options]
 */
export function daftar(path, renderFn, options = {}) {
  if (path.includes(':')) {
    ruteParam.push({
      segmen: path.split('/').filter(Boolean),
      render: renderFn,
      options,
    });
  } else {
    registry.set(path, { render: renderFn, options });
  }
}
export const daftarkan = daftar;

export function setOnRouteChange(fn) {
  onRouteChange = fn;
}

// ---------------------------------------------------------------------------
// Pencocokan rute berparameter
// ---------------------------------------------------------------------------
function cocokkan(segmenUrl) {
  for (const r of ruteParam) {
    const params = {};
    let ok = true;
    for (let i = 0; i < Math.max(r.segmen.length, segmenUrl.length) && ok; i++) {
      const pola = r.segmen[i];
      const nilai = segmenUrl[i];
      if (pola === undefined) ok = false;
      else if (pola.startsWith(':')) {
        const opsional = pola.endsWith('?');
        const nama = pola.slice(1).replace('?', '');
        if (nilai === undefined) ok = opsional;
        else params[nama] = decodeURIComponent(nilai);
      } else ok = pola === nilai;
    }
    if (ok) return { render: r.render, params, options: r.options || {} };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Parsing hash
// ---------------------------------------------------------------------------
/**
 * Urai hash → { path, query, params }.
 *
 *   '#/dashboard'             → { path: '/dashboard',  query: URLSearchParams, params: {} }
 *   '#/datadasar/siswa'       → { path: '/datadasar/siswa', … }
 *   '#/datadasar?tab=siswa'   → { path: '/datadasar',   query: ?tab=siswa,   params: {} }
 *   ''  / '#' / '#/'          → { path: '/dashboard',  … }
 *
 * `params` di sini SELALU kosong. Params rute berparameter diisi oleh
 * matcher saat render dan diteruskan ke handler sebagai `ctx.params`.
 */
export function bacaRute() {
  const mentah = (location.hash || '').replace(/^#/, '');
  const [pathPart, queryPart] = mentah.split('?');
  return {
    path:  pathPart || '/dashboard',
    query: new URLSearchParams(queryPart || ''),
    params: {},
  };
}

// ---------------------------------------------------------------------------
// Navigasi programatik
// ---------------------------------------------------------------------------
export function navigate(path, opts = {}) {
  const target = path.startsWith('#')
    ? path
    : '#' + (path.startsWith('/') ? path : '/' + path);

  if (location.hash === target) {
    render({ force: opts.force === true });
  } else {
    location.hash = target;
  }
}

export function back() {
  history.back();
}

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------
function cekAkses(path, state) {
  // Rute tanpa shell (login, scan publik, dsb.) selalu boleh.
  if ([...TANPA_SHELL].some((p) => path === p || path.startsWith(p + '/'))) {
    return true;
  }
  if (typeof bolehAkses === 'function') {
    if (!bolehAkses(path, state)) {
      if (location.hash !== '#/login') location.hash = '#/login';
      return false;
    }
    return true;
  }
  // Fallback inline
  if (!state.user && path !== '/login') {
    if (location.hash !== '#/login') location.hash = '#/login';
    return false;
  }
  if (state.user && path === '/login') {
    if (location.hash !== '#/dashboard') location.hash = '#/dashboard';
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Shell persisten
// ---------------------------------------------------------------------------
function identitasShell() {
  const { user, role } = getState();
  if (!user) return null;
  return `${user.uid}|${role || ''}`;
}

function bangunShell(app) {
  const root = document.createElement('div');
  root.className = 'ale-shell';
  // Topbar DI LUAR .app; sidebar DI DALAM .app sebagai kolom 1.
  // Ini WAJIB agar dashboard.css (.app grid) bekerja.
  root.innerHTML = `
    ${typeof sidebarMod.topbar === 'function' ? sidebarMod.topbar() : ''}
    <div class="app">
      ${typeof sidebarMod.sidebar === 'function' ? sidebarMod.sidebar() : ''}
      <div class="main">
        <main id="slot-halaman" class="ale-main" tabindex="-1"></main>
      </div>
    </div>
    <div class="ale-tirai" id="aleTirai" hidden></div>
  `;
  app.innerHTML = '';
  app.appendChild(root);
  shellRoot = root;
  shellUid = identitasShell();

  try {
    if (typeof sidebarMod.pasangShell === 'function') sidebarMod.pasangShell();
  } catch (e) {
    console.warn('[router] pasangShell gagal:', e);
  }

  return root;
}

function pastikanShell(app) {
  const ident = identitasShell();
  if (shellRoot && shellRoot.isConnected && shellUid === ident) {
    return shellRoot;
  }
  return bangunShell(app);
}

function hancurkanShell() {
  if (shellRoot && shellRoot.isConnected) shellRoot.remove();
  shellRoot = null;
  shellUid = null;
}

function slotKonten() {
  return (shellRoot && shellRoot.querySelector('#slot-halaman'))
      || document.getElementById('slot-halaman');
}

function tandaiAktif() {
  try {
    if (typeof sidebarMod.perbaruiAktif === 'function') {
      sidebarMod.perbaruiAktif();
    }
  } catch (e) {
    console.warn('[router] perbaruiAktif gagal:', e);
  }
}

// ---------------------------------------------------------------------------
// Render halaman aktif
// ---------------------------------------------------------------------------
export function render(opsi = {}) {
  const force = opsi && opsi.force === true;

  const app = wadahGlobal || document.getElementById('app');
  if (!app) return;

  const { path: rawPath, query } = bacaRute();
  const path = typeof normalizeHash === 'function'
    ? normalizeHash(location.hash)
    : rawPath;

  // Patch 2d — lewati render bila hanya query berubah pada path yang sama.
  const kunci = path + '?' + (query ? query.toString() : '');
  if (!force) {
    if (ruteTerakhir === kunci) return;
    if (ruteTerakhir) {
      const pathLama = ruteTerakhir.split('?')[0];
      if (pathLama === path) {
        ruteTerakhir = kunci;
        return;
      }
    }
  }
  ruteTerakhir = kunci;

  const state = getState();
  if (!cekAkses(path, state)) return;

  if (path === '/login' && state.user) {
    location.hash = '#/dashboard';
    return;
  }

  // Cari meta + handler
  let meta = (typeof ROUTES === 'object' && ROUTES[path]) || {
    page: path.split('/')[1] || 'home',
    title: path,
  };
  let entry = registry.get(path);
  let params = {};

  if (!entry) {
    const match = cocokkan(path.split('/').filter(Boolean));
    if (match) {
      entry = { render: match.render, options: match.options };
      params = match.params;
    }
  }

  // Fallback /perencanaan/xxx → /perencanaan
  if (!entry && path.startsWith('/perencanaan/')) {
    meta = {
      page: 'perencanaan',
      title: meta.title || 'Perencanaan',
      sub: path.split('/')[2],
    };
    entry = registry.get('/perencanaan');
  }

  // 404
  if (!entry) {
    entry = registry.get('__notfound__');
    meta = { page: 'notfound', title: 'Tidak Ditemukan' };
  }

  // Tentukan mode shell
  const options = entry?.options || {};
  let useShell;
  if (options.shell === true)             useShell = true;
  else if (options.shell === false)       useShell = false;
  else if (meta && meta.shell === false)  useShell = false;
  else if (meta && meta.shell === true)   useShell = true;
  else useShell = ![...TANPA_SHELL].some((p) => path === p || path.startsWith(p + '/'));

  setState({ route: path });

  if (sedangMerender) return;
  sedangMerender = true;
  lastRenderedHash = location.hash;

  // Cleanup handler sebelumnya
  if (typeof bersihkan === 'function') {
    try { bersihkan(); } catch (e) { console.error('[router] cleanup error:', e); }
  }
  bersihkan = null;

  let wadahHalaman;
  if (useShell) {
    pastikanShell(app);
    const slot = slotKonten();
    if (!slot) {
      app.innerHTML = '';
      wadahHalaman = app;
    } else {
      slot.innerHTML = '';
      wadahHalaman = slot;
    }
  } else {
    hancurkanShell();
    app.innerHTML = '';
    wadahHalaman = app;
  }

  const ctx = { path, meta, query, sub: meta?.sub, params, shell: useShell };
  const handler = entry?.render;

  Promise.resolve()
    .then(() => (handler ? handler(wadahHalaman, ctx) : null))
    .then((cleanupFn) => {
      if (typeof cleanupFn === 'function') bersihkan = cleanupFn;

      if (useShell && wadahHalaman.querySelector('.ale-shell')) {
        console.warn(
          '[router] Halaman "%s" masih merender shell-nya sendiri. ' +
          'Hapus sidebar()/topbar() dari halaman, atau daftarkan dengan ' +
          '{ shell: false } untuk sementara.',
          path
        );
      }
    })
    .catch((err) => {
      console.error('[router] render error:', path, err);
      wadahHalaman.innerHTML = `
        <div style="padding:32px;font-family:sans-serif;color:#dc2626;max-width:640px">
          <h2 style="margin:0 0 8px">Terjadi kesalahan saat memuat halaman</h2>
          <p style="margin:0 0 12px">${String(err?.message || err).replace(/</g, '&lt;')}</p>
          <button onclick="location.hash='#/dashboard'"
                  style="padding:8px 16px;border:0;border-radius:6px;background:#0e7490;color:#fff;cursor:pointer">
            Kembali ke Dashboard
          </button>
        </div>`;
    })
    .finally(() => {
      sedangMerender = false;

      if (location.hash !== lastRenderedHash) {
        render();
        return;
      }

      window.scrollTo({ top: 0, behavior: 'instant' });

      if (useShell) {
        tandaiAktif();
        try { sidebarMod.terapkanGulir?.(); } catch (_) {}
      } else {
        document.querySelectorAll('.ale-side a').forEach((a) => {
          const href = (a.getAttribute('href') || '').replace(/^#/, '');
          a.classList.toggle(
            'aktif',
            href !== '' && (path === href || path.startsWith(`${href}/`))
          );
        });
      }

      try { onRouteChange?.(path, meta); } catch (_) { /* ignore */ }
    });
}

function render404(wadah, path) {
  wadah.innerHTML = `
    <div style="padding:32px;text-align:center;font-family:sans-serif">
      <h2 style="margin:0 0 8px">404 — Halaman Tidak Ditemukan</h2>
      <p style="margin:0 0 16px;color:#64748b">Rute <code>${path}</code> belum terdaftar.</p>
      <button onclick="location.hash='#/dashboard'"
              style="padding:8px 16px;border:0;border-radius:6px;background:#0e7490;color:#fff;cursor:pointer">
        Kembali ke Dashboard
      </button>
    </div>`;
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
let started = false;

export function mulaiRouter(wadah) {
  if (started) return;
  started = true;

  wadahGlobal = wadah || document.getElementById('app');
  if (!wadahGlobal) {
    console.error('[router] Elemen #app tidak ditemukan di DOM.');
    return;
  }

  const state = getState();
  if (!location.hash || location.hash === '#' || location.hash === '#/') {
    location.hash = state.user ? '#/dashboard' : '#/login';
  }

  if (!registry.has('__notfound__')) {
    registry.set('__notfound__', {
      render: (w) => render404(w, location.hash),
      options: {},
    });
  }

  window.addEventListener('hashchange', () => render());
  render();
}