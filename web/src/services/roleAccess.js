const DASHBOARD_ONLY_ROLES = new Set(['kepala_sekolah', 'wali_kelas']);

export function canOpenRolePath(role, path) {
  if (DASHBOARD_ONLY_ROLES.has(role)) return path === '/dashboard';
  return true;
}
