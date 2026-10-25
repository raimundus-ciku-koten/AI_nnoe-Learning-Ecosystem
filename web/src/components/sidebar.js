// web/src/components/sidebar.js
/**
 * sidebar.js — Topbar + Sidebar (merged).
 *
 * Fitur:
 *   - Sidebar multi-grup dengan expand/collapse (aria-expanded / aria-controls).
 *   - Topbar dengan brand, tombol keluar, dropdown profil + ulasan.
 *   - Keyboard nav penuh (Tab, ArrowUp/Down, Home/End, Escape).
 *   - Focus trap untuk popover (WCAG 2.2 AA).
 *   - Preservasi scroll position sidebar antar navigasi.
 *   - Sinkronisasi sub-menu aktif via hashchange + event 'ale:rute-berubah'.
 *   - Grup dengan TEPAT 1 item rute → dirender sebagai link tunggal
 *     tanpa chevron (mis. grup "Dasbor").
 *
 * Kelas CSS:
 *   Seluruh kelas memakai prefiks "ale-*" (dashboard.css).
 *   Jangan ganti ke BEM "sidebar__*" / "topbar__*" — tidak akan
 *   ter-styling dan layout shell akan pecah.
 *
 * API shell (dipakai router.js):
 *   sidebar(), topbar()      → markup HTML
 *   pasangShell()            → pasang listener global (idempoten)
 *   slotKonten()             → elemen <main id="slot-halaman">
 *   perbaruiAktif()          → re-render daftar menu (submenu aktif)
 *   perbaruiHeader(profil)   → update nama/logo/avatar di topbar
 *   terapkanGulir()          → scroll ke kartu Dasbor (?k=...)
 */
import { getState } from '../state.js';
import { LINK_PERENCANAAN } from '../config.js';
import { menuUntuk } from '../menu.js';
import { logout } from '../auth.js';
import { hentikanChat } from '../services/chatSync.js';
import { jalankanAksi } from './profilaksi.js';
import { toast } from './toast.js';
import {
  esc, ikon, inisial, namaDariUser, ambilProfil,
  htmlAvatar, LABEL_PERAN, linkLuarAman,
} from '../ui.js';

// ============================================================================
// KONFIGURASI & FALLBACK
// ============================================================================
const GULIR = {
  jadwal:  'aleKartuJadwal',
  tugas:   'aleKartuTugas',
  kelas:   'aleKartuKelas',
  progres: 'aleKartuStatus',
  akses:   'aleKartuAkses',
};

const grupTerbuka = new Set(['x-chat']);
let posisiSisi   = 0;
let terpasang    = false;
let sedangKeluar = false;

/**
 * Helper ikon dengan kelas default `ale-ikon`.
 *   ik('chat')                → <i class="bi bi-chat-dots ale-ikon"></i>
 *   ik('chat', 'ale-chev')    → <i class="bi bi-chat-dots ale-ikon ale-chev"></i>
 */
const ik = (nama, kelas = '') =>
  ikon(nama, ['ale-ikon', kelas].filter(Boolean).join(' '));

// Fallback menu bila menu.js belum termuat / mengembalikan bentuk tidak valid.
const MENU_FALLBACK = [
  { id: 'dasbor', judul: 'Dashboard', ikon: 'speedometer2', items: [
    { status: 'rute', judul: 'Beranda', href: '#/dashboard' },
  ]},
  { id: 'datadasar', judul: 'Data Dasar', ikon: 'database', items: [
    { status: 'rute', judul: 'Profil Guru & Sekolah',   href: '#/datadasar/profil'  },
    { status: 'rute', judul: 'Tahun Ajaran & Semester', href: '#/datadasar/ta'      },
    { status: 'rute', judul: 'Kelas & Mapel Saya',      href: '#/datadasar/kelas'   },
    { status: 'rute', judul: 'Data Siswa',              href: '#/datadasar/siswa'   },
    { status: 'rute', judul: 'Barcode & Kartu Absensi', href: '#/datadasar/barcode' },
    { status: 'rute', judul: 'Jadwal Mengajar',         href: '#/datadasar/jadwal'  },
    { status: 'rute', judul: 'Kelompok & Denah Duduk',  href: '#/datadasar/denah'   },
  ]},
  { id: 'perencanaan', judul: 'Perencanaan', ikon: 'layers', items: [
    { status: 'rute', judul: 'RPE',    href: '#/perencanaan/rpe'    },
    { status: 'rute', judul: 'ATP',    href: '#/perencanaan/atp'    },
    { status: 'rute', judul: 'Prota',  href: '#/perencanaan/prota'  },
    { status: 'rute', judul: 'Prosem', href: '#/perencanaan/prosem' },
    { status: 'rute', judul: 'KKTP',   href: '#/perencanaan/kktp'   },
    { status: 'rute', judul: 'Modul',  href: '#/perencanaan/modul'  },
    { status: 'rute', judul: 'Cover',  href: '#/perencanaan/cover'  },
  ]},
  { id: 'x-chat', judul: 'Chat', ikon: 'chat-dots', items: [
    { status: 'rute', judul: 'Semua Percakapan', href: '#/chat'        },
    { status: 'rute', judul: 'Kontak',           href: '#/chat/kontak' },
    { status: 'rute', judul: 'Grup',             href: '#/chat/grup'   },
  ]},
  { id: 'riwayat', judul: 'Riwayat', ikon: 'file-earmark-text', items: [
    { status: 'rute', judul: 'Hasil Perencanaan', href: '#/hasil'  },
    { status: 'rute', judul: 'Profil',            href: '#/profil' },
  ]},
];

// ============================================================================
// rute() — path + query + k (untuk data-gulir)
// ============================================================================
function rute() {
  const [path, query] = location.hash.replace('#', '').split('?');
  const params = new URLSearchParams(query || '');
  return {
    path: path || '/dashboard',
    query: params,
    k: params.get('k') || '',
  };
}

// ============================================================================
// PROSES KELUAR
// ============================================================================
async function prosesKeluar(tombol) {
  if (sedangKeluar) return;
  if (!window.confirm('Keluar dari akun ini?')) return;

  sedangKeluar = true;
  const btn = tombol || document.getElementById('keluar');
  const labelAsli = btn ? btn.innerHTML : null;
  if (btn) {
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.innerHTML = `${ik('keluar')}<span>Keluar…</span>`;
  }

  try {
    await hentikanChat(); // tandai offline & lepas token notifikasi SEBELUM signOut
    await logout();
  } catch (err) {
    console.error('[sidebar] logout gagal:', err);
    try {
      const mod = await import('./toast.js');
      (mod.toast || mod.default)?.('Gagal keluar. Silakan coba lagi.', 'error');
    } catch (_) { /* toast opsional */ }
  } finally {
    sedangKeluar = false;
    if (location.hash !== '#/login') {
      location.hash = '#/login';
    } else {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
    if (btn) {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      if (labelAsli != null) btn.innerHTML = labelAsli;
    }
  }
}

// ============================================================================
// NAVIGASI INTERAKTIF
// ============================================================================
function setBuka(terbuka, kembaliFokus = false) {
  const sisi   = document.getElementById('ale-side');
  const tombol = document.getElementById('aleMenuBtn');
  const tirai  = document.getElementById('aleTirai');

  if (!sisi || !tombol) {
    document.body.classList.remove('ale-kunci');
    return;
  }
  // CSS dashboard.css memakai .ale-side.is-open untuk state terbuka
  sisi.classList.toggle('is-open', terbuka);
  if (tirai) tirai.hidden = !terbuka;
  tombol.setAttribute('aria-expanded', String(terbuka));
  document.body.classList.toggle('ale-kunci', terbuka);

  if (terbuka) {
    const pertama = sisi.querySelector('.ale-grup-btn');
    if (pertama) pertama.focus();
  } else if (kembaliFokus) {
    tombol.focus();
  }
}

const POP = { aleMenuUlasan: 'aleKebab', aleMenuProfil: 'aleProfilBtn' };

function tutupPop(kembaliFokus = false) {
  Object.entries(POP).forEach(([idMenu, idTombol]) => {
    const menu   = document.getElementById(idMenu);
    const tombol = document.getElementById(idTombol);
    if (menu && !menu.hidden) {
      menu.hidden = true;
      if (tombol) {
        tombol.setAttribute('aria-expanded', 'false');
        if (kembaliFokus) tombol.focus();
      }
    }
  });
}

function bukaPop(idMenu) {
  tutupPop();
  const menu   = document.getElementById(idMenu);
  const tombol = document.getElementById(POP[idMenu]);
  if (!menu || !tombol) return;
  menu.hidden = false;
  tombol.setAttribute('aria-expanded', 'true');
  const pertama = menu.querySelector('[role="menuitem"]');
  if (pertama) pertama.focus();
}

function gulirKe(kunci) {
  const el = document.getElementById(GULIR[kunci]);
  if (!el) return;
  const kurang = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: kurang ? 'auto' : 'smooth', block: 'start' });
  el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
}

export function terapkanGulir() {
  const { k } = rute();
  if (k && GULIR[k]) setTimeout(() => gulirKe(k), 50);
}

// ============================================================================
// SINKRONISASI SUB-MENU AKTIF
// ============================================================================
export function perbaruiAktif() {
  const nav = document.querySelector('.ale-nav');
  if (!nav) return;
  const { role } = getState();
  nav.innerHTML = htmlMenu(role, rute());
}

// ============================================================================
// LISTENER GLOBAL
// ============================================================================
function pasangPenangan() {
  if (terpasang) return;
  terpasang = true;

  document.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;

    // Tombol keluar
    const tombolKeluar = t.closest('#keluar');
    if (tombolKeluar) {
      e.preventDefault();
      prosesKeluar(tombolKeluar);
      return;
    }

    // Popover (ulasan / profil)
    const picu = t.closest('[data-pop]');
    if (picu) {
      const idMenu = picu.dataset.pop;
      const menu   = document.getElementById(idMenu);
      if (menu && !menu.hidden) tutupPop(true);
      else                      bukaPop(idMenu);
      return;
    }

    // Aksi dari menu profil
    const aksi = t.closest('[data-aksi]');
    if (aksi) {
      tutupPop(true);
      if (aksi.dataset.aksi !== 'tutup') {
        void jalankanAksi(aksi.dataset.aksi).catch((error) => {
          toast(error?.message || 'Tindakan profil gagal dijalankan.', 'error');
        });
      }
      return;
    }
    if (!t.closest('.ale-menu-wrap')) tutupPop();

    // Burger (mobile)
    if (t.closest('#aleMenuBtn')) {
      const sisi = document.getElementById('ale-side');
      setBuka(!(sisi && sisi.classList.contains('is-open')));
      return;
    }
    if (t.closest('#aleTirai')) { setBuka(false); return; }

    // Expand/collapse grup menu
    const grup = t.closest('.ale-grup-btn');
    if (grup && grup.tagName === 'BUTTON') {
      const buka = grup.getAttribute('aria-expanded') !== 'true';
      grup.setAttribute('aria-expanded', String(buka));
      const panel = document.getElementById(grup.getAttribute('aria-controls'));
      if (panel) panel.hidden = !buka;
      if (buka) grupTerbuka.add(grup.dataset.grup);
      else      grupTerbuka.delete(grup.dataset.grup);
      return;
    }

    // Sub-menu dengan data-gulir (scroll ke kartu dashboard)
    const gulir = t.closest('[data-gulir]');
    if (gulir) {
      setBuka(false);
      if (rute().path === '/dashboard' &&
          document.getElementById(GULIR[gulir.dataset.gulir])) {
        e.preventDefault();
        document.querySelectorAll('#ale-side .ale-sub').forEach((a) => {
          a.classList.remove('aktif');
          a.removeAttribute('aria-current');
        });
        gulir.classList.add('aktif');
        gulir.setAttribute('aria-current', 'page');
        history.replaceState(null, '', gulir.getAttribute('href'));
        gulirKe(gulir.dataset.gulir);
        window.dispatchEvent(new Event('ale:rute-berubah'));
      }
      return;
    }

    // Tutup offcanvas saat klik sub-menu di HP
    if (t.closest('#ale-side a[href]')) { setBuka(false); return; }
  });

  document.addEventListener('keydown', (e) => {
    // Keyboard nav untuk popover
    const menuAktif = document.activeElement && document.activeElement.closest
      ? document.activeElement.closest('.ale-pop') : null;
    if (menuAktif && !menuAktif.hidden) {
      if (e.key === 'Tab') { tutupPop(); }
      else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
        const butir = Array.from(menuAktif.querySelectorAll('[role="menuitem"]'));
        const i = butir.indexOf(document.activeElement);
        let n = i;
        if (e.key === 'ArrowDown') n = (i + 1) % butir.length;
        if (e.key === 'ArrowUp')   n = (i - 1 + butir.length) % butir.length;
        if (e.key === 'Home')      n = 0;
        if (e.key === 'End')       n = butir.length - 1;
        e.preventDefault();
        if (butir[n]) butir[n].focus();
        return;
      }
    }

    if (e.key === 'Escape') {
      const terbuka = Object.keys(POP).some((id) => {
        const m = document.getElementById(id);
        return m && !m.hidden;
      });
      if (terbuka) { tutupPop(true); return; }
      const sisi = document.getElementById('ale-side');
      if (sisi && sisi.classList.contains('is-open')) setBuka(false, true);
    }
  });

  // Preservasi scroll position sidebar
  document.addEventListener('scroll', (e) => {
    if (e.target && e.target.id === 'ale-side') posisiSisi = e.target.scrollTop;
  }, true);

  window.addEventListener('hashchange', () => {
    setBuka(false);
    tutupPop();
    perbaruiAktif();
  });

  window.addEventListener('ale:rute-berubah', perbaruiAktif);
}

// ============================================================================
// HEADER / TOPBAR UPDATE
// ============================================================================
export function perbaruiHeader({ nama, sekolah, logoSekolah } = {}) {
  const n = document.getElementById('aleNamaTop');
  if (n && nama) n.textContent = nama;

  const s = document.getElementById('aleSubTop');
  if (s && sekolah) s.textContent = sekolah;

  const a = document.querySelector('#aleAvatarWrap .ale-avatar');
  if (a && nama && a.tagName !== 'IMG') a.textContent = inisial(nama);

  const g = document.getElementById('aleLogoSekolah');
  if (g && /^https:\/\//i.test(logoSekolah || '')) {
    g.src = logoSekolah;
    g.hidden = false;
  }

  const sn = document.getElementById('sidebarUserName');
  if (sn && nama) sn.textContent = nama;
}
export const perbaruiTopbar = perbaruiHeader;

// ============================================================================
// HTML MENU SIDEBAR
// ============================================================================
function htmlMenu(role, { path, query, k }) {
  const menuDariJs = (typeof menuUntuk === 'function') ? menuUntuk(role) : null;
  const menu = (Array.isArray(menuDariJs) && menuDariJs.length) ? menuDariJs : MENU_FALLBACK;
  const gas = linkLuarAman(LINK_PERENCANAAN);
  const sudahAktif = new Set();

  return menu.map((g) => {
    const daftarItem = Array.isArray(g.items) ? g.items : [];

    // ---- Grup dengan TEPAT 1 item rute → render sebagai LINK TUNGGAL ----
    // (mis. grup "Dasbor" yang isinya cuma "Beranda")
    if (daftarItem.length === 1 && daftarItem[0].status === 'rute') {
      const m = daftarItem[0];
      const [mPath, mQuery] = (m.href || '').replace('#', '').split('?');
      const mParams = new URLSearchParams(mQuery || '');
      const pathMatch  = mPath === path;
      const queryMatch = Array.from(mParams.entries())
        .every(([kk, vv]) => (query ? query.get(kk) : null) === vv);
      const aktif = pathMatch && queryMatch && !k;

      return `
        <div class="ale-grup-menu${aktif ? ' has-aktif' : ''}" data-grup="${g.id}">
          <a class="ale-grup-btn${aktif ? ' aktif' : ''}"
             href="${m.href}" data-grup="${g.id}"
             ${aktif ? 'aria-current="page"' : ''}>
            ${ik(g.ikon)}
            <span class="ale-grup-teks">${esc(g.judul)}</span>
          </a>
        </div>`;
    }

    // ---- Grup expand-collapse ----
    let adaAktif = false;
    const items = daftarItem.map((m) => {
      if (m.status === 'rute') {
        const [mPath, mQuery] = (m.href || '').replace('#', '').split('?');
        const mParams = new URLSearchParams(mQuery || '');
        const pathMatch  = mPath === path;
        const queryMatch = Array.from(mParams.entries())
          .every(([kk, vv]) => (query ? query.get(kk) : null) === vv);

        let aktif = pathMatch && queryMatch;
        if (aktif) {
          if (sudahAktif.has(m.href)) aktif = false;
          else sudahAktif.add(m.href);
        }
        if (aktif) adaAktif = true;

        return `<a class="ale-sub${aktif ? ' aktif' : ''}" href="${m.href}"
                   ${aktif ? 'aria-current="page"' : ''}>
          <span class="ale-sub-teks">${esc(m.judul)}</span>
        </a>`;
      }

      if (m.status === 'gulir') {
        const aktif = path === '/dashboard' && k === m.kunci;
        if (aktif) adaAktif = true;
        return `<a class="ale-sub${aktif ? ' aktif' : ''}" href="${m.href}"
                   data-gulir="${m.kunci}"${aktif ? ' aria-current="page"' : ''}>
          <span class="ale-sub-teks">${esc(m.judul)}</span>
        </a>`;
      }

      if (m.status === 'gas' && gas) {
        return `<a class="ale-sub" href="${esc(LINK_PERENCANAAN)}"
                   target="_blank" rel="noopener noreferrer">
          <span class="ale-sub-teks">${esc(m.judul)}</span>
          ${ikon('luar', 'ale-ikon ale-sub-luar')}
        </a>`;
      }

      return `<span class="ale-sub is-soon" aria-disabled="true">
        <span class="ale-sub-teks">${esc(m.judul)}</span>
        <span class="ale-tag">Segera</span>
      </span>`;
    }).join('');

    if (adaAktif) grupTerbuka.add(g.id);
    const buka = grupTerbuka.has(g.id);

    return `
      <div class="ale-grup-menu${adaAktif ? ' has-aktif' : ''}" data-grup="${g.id}">
        <button type="button" class="ale-grup-btn"
                id="g-${g.id}" data-grup="${g.id}"
                aria-expanded="${buka}" aria-controls="p-${g.id}">
          ${ik(g.ikon)}
          <span class="ale-grup-teks">${esc(g.judul)}</span>
          ${ikon('turun', 'ale-ikon ale-chev')}
        </button>
        <div class="ale-panel" id="p-${g.id}" role="group"
             aria-labelledby="g-${g.id}"${buka ? '' : ' hidden'}>
          ${items}
        </div>
      </div>`;
  }).join('');
}

// ============================================================================
// KOMPONEN TOPBAR
// ============================================================================
export function topbar() {
  const { user, role } = getState();
  const profil = (user && ambilProfil(user.uid)) || {};
  const nama   = profil.nama || namaDariUser(user);
  const peran  = LABEL_PERAN[role] || 'Pengguna';
  const sub    = profil.sekolah || peran;
  const foto   = user?.photoURL && /^https:\/\//i.test(user.photoURL) ? user.photoURL : '';
  const logo   = /^https:\/\//i.test(profil.logoSekolah || '') ? profil.logoSekolah : '';

  const item = (aksi, ikNama, teks, warna) =>
    `<button type="button" class="ale-pop-item ale-pw-${warna}"
             role="menuitem" data-aksi="${aksi}">
      ${ik(ikNama)}<span>${teks}</span>
    </button>`;

  return `
    <header class="site-header ale-topbar" id="topbar">
      <div class="ale-topbar-inner">

        <div class="ale-topbar-kiri">
          <button type="button" class="ale-menu-btn" id="aleMenuBtn"
                  aria-controls="ale-side" aria-expanded="false"
                  aria-label="Buka menu navigasi">
            ${ik('menu')}<span>Menu</span>
          </button>

          <a class="ale-topbar-brand" href="#/dashboard"
             aria-label="AI-nnoe Learning Ecosystem — Beranda">
            <img src="/logo-ale-mark-1x.png" srcset="/logo-ale-mark-2x.png 2x" alt="" width="52" height="36"
                 class="ale-topbar-brand-logo">
            <span class="ale-topbar-brand-teks">
              <strong>AI-nnoe</strong>
              <small>Learning Ecosystem</small>
            </span>
          </a>
        </div>

        <div class="ale-topbar-aksi">
          <img class="ale-logo-sekolah" id="aleLogoSekolah" alt="Logo sekolah"
               width="40" height="40"${logo ? ` src="${esc(logo)}"` : ' hidden'}>

          <div class="ale-menu-wrap">
            <button type="button" class="ale-ikon-btn" id="aleKebab"
                    data-pop="aleMenuUlasan" aria-haspopup="menu"
                    aria-expanded="false" aria-controls="aleMenuUlasan"
                    aria-label="Opsi lainnya">
              ${ik('titik3')}
            </button>
            <div class="ale-pop" id="aleMenuUlasan" role="menu"
                 aria-label="Opsi lainnya" hidden>
              ${item('ulasan', 'ulasan', 'Beri ulasan aplikasi', 'sky')}
            </div>
          </div>

          <div class="ale-menu-wrap">
            <button type="button" class="ale-akun" id="aleProfilBtn"
                    data-pop="aleMenuProfil" aria-haspopup="menu"
                    aria-expanded="false" aria-controls="aleMenuProfil">
              <span class="ale-avatar-wrap" id="aleAvatarWrap">${htmlAvatar(foto, nama)}</span>
              <span class="ale-akun-teks">
                <strong id="aleNamaTop">${esc(nama)}</strong>
                <span id="aleSubTop">${esc(sub)}</span>
              </span>
              ${ikon('turun', 'ale-ikon ale-chev')}
            </button>

            <div class="ale-pop ale-pop-profil" id="aleMenuProfil"
                 role="menu" aria-label="Menu profil" hidden>
              <p class="ale-pop-judul" role="presentation">Profil</p>
              ${item('notif',       'lonceng', 'Aktifkan notifikasi',        'amber')}
              <hr class="ale-pop-sekat" role="separator">
              ${item('kelas-mapel', 'kartuid', 'Kelas & mapel saya',         'sky')}
              ${item('api-key',     'kunciapi','AI & Layanan',              'cyan')}
              ${item('google',      'google',  'Hubungkan Google',           'indigo')}
              <hr class="ale-pop-sekat" role="separator">
              ${item('tutup',       'tutup',   'Tutup',                      'sky')}
            </div>
          </div>

          <button type="button" id="keluar" class="btn ale-keluar"
                  aria-label="Keluar dari akun">
            ${ik('keluar')}<span>Keluar</span>
          </button>
        </div>
      </div>
    </header>
  `;
}

// ============================================================================
// KOMPONEN SIDEBAR (tanpa brand-block; brand hanya di topbar)
// ============================================================================
export function sidebar() {
  pasangPenangan();

  const { user, role } = getState();
  const profil = (user && ambilProfil(user.uid)) || {};
  const nama   = profil.nama || namaDariUser(user);
  const peran  = LABEL_PERAN[role] || 'Pengguna';

  requestAnimationFrame(() => {
    const s = document.getElementById('ale-side');
    if (s) s.scrollTop = posisiSisi;
  });

  return `
    <aside class="ale-side" id="ale-side" aria-label="Menu utama">
      <nav class="ale-nav" aria-label="Navigasi utama">
        ${htmlMenu(role, rute())}
      </nav>

      <div class="ale-side-foot">
        <small>Login sebagai</small>
        <strong id="sidebarUserName">${esc(nama)}</strong>
        <div id="sidebarUserRole">${esc(peran)}</div>
      </div>
    </aside>
  `;
}

// ============================================================================
// API SHELL — dipakai router.js
// ============================================================================

/** Pasang listener global shell (idempoten). */
export function pasangShell() {
  pasangPenangan();
}

/** Kembalikan elemen <main id="slot-halaman"> tempat halaman di-mount. */
export function slotKonten() {
  return document.getElementById('slot-halaman')
      || document.getElementById('app')
      || null;
}