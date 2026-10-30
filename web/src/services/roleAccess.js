import { cariMenu, menuUntukPeran } from '../navigasi.js';

const ROLES = new Set([
  'superadmin', 'admin_sekolah', 'admin', 'operator', 'guru', 'guru_bk',
  'guru_kokurikuler', 'guru_ekstrakurikuler', 'siswa', 'ortu', 'orang_tua',
  'kepala_sekolah', 'wali_kelas', 'demo',
]);
const DASHBOARD_ONLY_ROLES = new Set(['kepala_sekolah', 'wali_kelas']);

function memilikiMenu(role, path) {
  return menuUntukPeran(role).some((group) => group.item.some((item) => item.path === path));
}

export function canOpenRolePath(role, path, search = '') {
  const activeRole = String(role || '').trim().toLowerCase();
  if (!ROLES.has(activeRole)) return false;
  if (activeRole === 'demo') return path === '/trial';
  if (DASHBOARD_ONLY_ROLES.has(activeRole)) return path === '/dashboard';
  if (path === '/dashboard') return true;

  const hasPlanning = memilikiMenu(activeRole, '/perencanaan');
  if (hasPlanning && (/^\/perencanaan\/[^/]+$/.test(path) || path === '/perencanaan')) return true;
  if (path === '/datadasar' && memilikiMenu(activeRole, '/datadasar/profil')) return true;
  if (path === '/profil' && memilikiMenu(activeRole, '/pengaturan/akun')) return true;

  const legacyPlanning = {
    '/perencanaan/rpe': '?jenis=rpe',
    '/perencanaan/atp': '?jenis=atp',
    '/perencanaan/prota': '?jenis=prota',
    '/perencanaan/prosem': '?jenis=prosem',
    '/perencanaan/kktp': '?jenis=kktp',
    '/perencanaan/modul': '?jenis=modul',
  }[path];
  if (legacyPlanning && hasPlanning) return true;

  return cariMenu(path, search, activeRole) !== null;
}
