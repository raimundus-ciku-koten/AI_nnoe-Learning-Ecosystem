import { menuUntukPeran } from '../navigasi.js';

const DASHBOARD_ONLY_ROLES = new Set(['kepala_sekolah', 'wali_kelas']);
const KNOWN_ROLES = new Set([
  ...DASHBOARD_ONLY_ROLES,
  'admin',
  'admin_sekolah',
  'guru',
  'guru_bk',
  'guru_ekstrakurikuler',
  'guru_kokurikuler',
  'ortu',
  'orang_tua',
  'siswa',
  'operator',
  'superadmin',
  'demo',
]);

export function canOpenRolePath(role, path) {
  const normalizedRole = String(role || '').trim().toLowerCase();
  if (normalizedRole === 'demo') return path === '/trial';
  if (!KNOWN_ROLES.has(normalizedRole)) return path === '/dashboard';
  if (DASHBOARD_ONLY_ROLES.has(normalizedRole)) return path === '/dashboard';

  return menuUntukPeran(normalizedRole)
    .flatMap((group) => group.item)
    .some((item) => path === item.path || path.startsWith(`${item.path}/`));
}
