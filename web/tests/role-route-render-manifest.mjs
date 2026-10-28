import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { canOpenRolePath } from '../src/services/roleAccess.js';
import { menuUntukPeran } from '../src/navigasi.js';

const appSource = readFileSync(
  fileURLToPath(new URL('../src/App.jsx', import.meta.url)),
  'utf8',
);
const SUBMENU_RENDERED_PATHS = new Set([
  '/guru/catatan-pribadi',
  '/pengaturan/akun',
  '/pengaturan/notifikasi',
  '/pengaturan/preferensi',
  '/refleksi/pembelajaran',
  '/refleksi/portofolio',
  '/refleksi/kompetensi',
  '/refleksi/perbaikan',
]);

function extractAppRoutePatterns(source = appSource) {
  const routeAttribute = /<Route\b[^\n]*?\bpath=(?:"([^"]+)"|'([^']+)'|\{`([^`]+)`\})/g;
  return [...source.matchAll(routeAttribute)].map((match) => (
    match[1] || match[2] || match[3]
  )).map((path) => path.replace(/\$\{[^}]+\}/g, ':dynamic'));
}

function matchesRoutePattern(pattern, path) {
  if (pattern === '*') return true;
  const expected = pattern.split('/').filter(Boolean);
  const actual = path.split('/').filter(Boolean);
  let actualIndex = 0;

  for (const segment of expected) {
    if (segment === '*') return true;
    if (segment.startsWith(':')) {
      const optional = segment.endsWith('?');
      if (actualIndex >= actual.length && optional) continue;
      if (actualIndex >= actual.length) return false;
      actualIndex += 1;
      continue;
    }
    if (actual[actualIndex] !== segment) return false;
    actualIndex += 1;
  }

  return actualIndex === actual.length;
}

export function hasRenderedDestination(path, patterns = extractAppRoutePatterns()) {
  return SUBMENU_RENDERED_PATHS.has(path)
    || patterns.some((pattern) => pattern !== '*' && matchesRoutePattern(pattern, path));
}

export function buildRoleRouteRenderManifest() {
  return [...new Set([
    'admin', 'admin_sekolah', 'operator',
    'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler',
    'siswa', 'ortu', 'orang_tua', 'superadmin', 'demo',
    'kepala_sekolah', 'wali_kelas',
  ])].flatMap((role) => menuUntukPeran(role)
    .flatMap((group) => group.item)
    .map((item) => ({
      role,
      path: item.path,
      search: item.search || '',
      label: item.label,
      destination: SUBMENU_RENDERED_PATHS.has(item.path)
        ? 'submenu-module'
        : hasRenderedDestination(item.path) ? 'app-route-or-redirect' : 'fallback-guide',
      roleCanOpen: canOpenRolePath(role, item.path),
    })));
}

export { extractAppRoutePatterns, matchesRoutePattern };
