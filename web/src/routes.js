// web/src/routes.js
/**
 * routes.js — Peta rute & alias legacy.
 *
 * Menggantikan MAP_MENU_TO_SECTION di Partial_AppScripts.html.
 * URL lama `#atp` otomatis dialihkan ke `#/perencanaan/atp`.
 */

export const ROUTES = {
  '/login':             { page: 'login',       title: 'Masuk' },
  '/dashboard':         { page: 'dashboard',   title: 'Dashboard' },
  '/program-kegiatan':  { page: 'program-kegiatan', title: 'Program BK dan Kegiatan' },

  '/perencanaan':       { page: 'perencanaan', title: 'Perencanaan Pembelajaran' },
  '/perencanaan/rpe':   { page: 'perencanaan', title: 'RPE',        sub: 'rpe' },
  '/perencanaan/atp':   { page: 'perencanaan', title: 'ATP',        sub: 'atp' },
  '/perencanaan/prota': { page: 'perencanaan', title: 'Prota',      sub: 'prota' },
  '/perencanaan/prosem':{ page: 'perencanaan', title: 'Prosem',     sub: 'prosem' },
  '/perencanaan/kktp':  { page: 'perencanaan', title: 'KKTP',       sub: 'kktp' },
  '/perencanaan/modul': { page: 'perencanaan', title: 'Modul Ajar', sub: 'modul' },
  '/perencanaan/cover': { page: 'perencanaan', title: 'Cover',      sub: 'cover' },

  // Chat — semua sub-rute
  '/chat':              { page: 'chat',        title: 'Chat' },
  '/chat/baru':         { page: 'chat',        title: 'Percakapan Baru' },
  '/chat/kontak':       { page: 'chat',        title: 'Kontak' },

  '/datadasar':         { page: 'datadasar',   title: 'Data Dasar' },
  '/profil':            { page: 'profil',      title: 'Profil' },
};

export const LEGACY_ALIAS = {
  '#beranda':           '#/dashboard',
  '#rpe':               '#/perencanaan/rpe',
  '#atp':               '#/perencanaan/atp',
  '#prota':             '#/perencanaan/prota',
  '#prosem':            '#/perencanaan/prosem',
  '#kktp':              '#/perencanaan/kktp',
  '#modulAjar':         '#/perencanaan/modul',
  '#modulSiswa':        '#/perangkat/modul-siswa',
  '#coverPerangkat':    '#/perangkat/cover',
  '#bankSoal':          '#/asesmen/bank-soal',
  '#profilMengajar':    '#/datadasar/profil',
  '#hasilMapel':        '#/hasil/perencanaan',
  '#hasilPerencanaan':  '#/hasil/perencanaan',
};

export function normalizeHash(hash) {
  const h = String(hash || '').trim();
  if (!h || h === '#' || h === '#/') return '/dashboard';

  if (LEGACY_ALIAS[h]) {
    location.hash = LEGACY_ALIAS[h];
    return LEGACY_ALIAS[h].slice(1);
  }

  const raw = h.replace(/^#/, '').split('?')[0];
  if (!raw || raw === '/') return '/dashboard';
  if (raw.startsWith('/')) return raw;
  return '/' + raw;
}

export function bolehAkses(path, state) {
  const { user } = state;

  if (path === '/login') return true;
  if (!user) return false;

  const PUBLIC_FOR_AUTHED = [
    '/dashboard', '/perencanaan', '/chat', '/datadasar', '/profil',
  ];
  if (PUBLIC_FOR_AUTHED.some((p) => path === p || path.startsWith(p + '/'))) {
    return true;
  }
  return true;
}