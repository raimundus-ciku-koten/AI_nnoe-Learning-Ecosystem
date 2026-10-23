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

export function canOpenRolePath(role, path) {
  if (!APPLICATION_ROLES.has(role)) return false;
  if (DASHBOARD_ONLY_ROLES.has(role)) return path === '/dashboard';
  return true;
}
