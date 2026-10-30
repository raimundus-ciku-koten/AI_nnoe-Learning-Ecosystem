import { cariMenu, menuUntukPeran } from '../navigasi.js';

const ROLES = new Set([
  'superadmin', 'admin_sekolah', 'admin', 'operator', 'guru', 'guru_bk',
  'guru_kokurikuler', 'guru_ekstrakurikuler', 'siswa', 'ortu', 'orang_tua',
  'kepala_sekolah', 'wali_kelas', 'demo',
]);
const DASHBOARD_ONLY_ROLES = new Set(['kepala_sekolah', 'wali_kelas']);

function memilikiMenu(role, path, disabledMenuKeys = []) {
  return menuUntukPeran(role, disabledMenuKeys).some((group) => group.item.some((item) => item.path === path));
}

export function canOpenRolePath(role, path, search = '', disabledMenuKeys = []) {
  const activeRole = String(role || '').trim().toLowerCase();
  if (!ROLES.has(activeRole)) return false;
  if (activeRole === 'demo') return path === '/trial';
  if (DASHBOARD_ONLY_ROLES.has(activeRole)) return path === '/dashboard';
  if (path === '/dashboard') return true;

  const legacyPlanning = {
    '/perencanaan/rpe': '?jenis=rpe',
    '/perencanaan/atp': '?jenis=atp',
    '/perencanaan/prota': '?jenis=prota',
    '/perencanaan/prosem': '?jenis=prosem',
    '/perencanaan/kktp': '?jenis=kktp',
    '/perencanaan/modul': '?jenis=modul',
  }[path];
  if (legacyPlanning) {
    return cariMenu('/perencanaan', legacyPlanning, activeRole, disabledMenuKeys) !== null;
  }

  if (path === '/datadasar') {
    return cariMenu('/datadasar/profil', '', activeRole, disabledMenuKeys) !== null;
  }
  if (path === '/profil') {
    return cariMenu('/pengaturan/akun', '', activeRole, disabledMenuKeys) !== null;
  }

  const hasPlanning = memilikiMenu(activeRole, '/perencanaan', disabledMenuKeys);
  if (hasPlanning && (/^\/perencanaan\/[^/]+$/.test(path) || path === '/perencanaan')) {
    return cariMenu(path, search, activeRole, disabledMenuKeys) !== null;
  }

  return cariMenu(path, search, activeRole, disabledMenuKeys) !== null;
}
