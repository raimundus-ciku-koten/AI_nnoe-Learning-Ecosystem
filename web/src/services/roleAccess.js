import { cariMenu, menuUntukPeran } from '../navigasi.js';

const DASHBOARD_ONLY_ROLES = new Set(['kepala_sekolah', 'wali_kelas']);
const APPLICATION_ROLES = new Set([
  'superadmin',
  'admin_sekolah',
  'operator',
  'guru',
  'guru_bk',
  'guru_kokurikuler',
  'guru_ekstrakurikuler',
  'kepala_sekolah',
  'wali_kelas',
  'siswa',
  'ortu',
  'orang_tua',
]);

export function canOpenRolePath(role, path, search = '') {
  if (!APPLICATION_ROLES.has(role)) return false;
  if (DASHBOARD_ONLY_ROLES.has(role)) return path === '/dashboard';
  if (path === '/dashboard') return true;
  if (cariMenu(path, search, role)) return true;
  if (path === '/perencanaan' && !search) {
    return menuUntukPeran(role).some((group) =>
      group.item.some((item) => item.path === '/perencanaan')
    );
  }
  return false;
}
