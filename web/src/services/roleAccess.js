import { menuUntukPeran } from '../navigasi.js';

const LIMITED_SCOPE_PATHS = new Map([
  ['kepala_sekolah', new Set(['/kepala-sekolah/ringkasan'])],
  ['wali_kelas', new Set(['/wali-kelas/pemantauan'])],
]);
const KNOWN_ROLES = new Set([
  ...LIMITED_SCOPE_PATHS.keys(),
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

export function isSchoolAdminRole(role) {
  return ['admin', 'admin_sekolah'].includes(String(role || '').trim().toLowerCase());
}

export function isTeacherRole(role) {
  return ['guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler']
    .includes(String(role || '').trim().toLowerCase());
}

export function canOpenRolePath(role, path) {
  const normalizedRole = String(role || '').trim().toLowerCase();
  if (normalizedRole === 'demo') return path === '/trial';
  if (!KNOWN_ROLES.has(normalizedRole)) return path === '/dashboard';
  if (LIMITED_SCOPE_PATHS.has(normalizedRole)) {
    return path === '/dashboard' || LIMITED_SCOPE_PATHS.get(normalizedRole).has(path);
  }

  return menuUntukPeran(normalizedRole)
    .flatMap((group) => group.item)
    .some((item) => path === item.path || path.startsWith(`${item.path}/`));
}
