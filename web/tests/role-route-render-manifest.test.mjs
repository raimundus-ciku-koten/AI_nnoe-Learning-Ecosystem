import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRoleRouteRenderManifest,
  extractAppRoutePatterns,
  matchesRoutePattern,
} from './role-route-render-manifest.mjs';

test('manifest extracts explicit, parameterized, and generated App routes', () => {
  const patterns = extractAppRoutePatterns();

  assert.ok(patterns.includes('/admin/pengguna/:sub'));
  assert.ok(patterns.includes('/datadasar/:sub'));
  assert.ok(patterns.includes('/perencanaan/:id?/:jenis?'));
  assert.ok(patterns.includes('/perencanaan/:dynamic'));
  assert.ok(patterns.includes('*'));
  assert.equal(matchesRoutePattern('/chat/:chatId', '/chat/kontak'), true);
  assert.equal(matchesRoutePattern('/admin/pengguna/:sub', '/admin/pengguna/operator'), true);
  assert.equal(matchesRoutePattern('/admin/pengguna/:sub', '/admin/pengguna'), false);
  assert.equal(matchesRoutePattern('/perencanaan/:id?/:jenis?', '/perencanaan'), true);
});

test('every menu destination for every role resolves to an App route and is role-authorized', () => {
  const manifest = buildRoleRouteRenderManifest();

  assert.ok(manifest.length > 0);
  for (const entry of manifest) {
    const context = `${entry.role}: ${entry.label} (${entry.path}${entry.search})`;
    assert.ok(entry.roleCanOpen, `${context} is listed in the role menu but denied by route policy`);
    assert.ok(
      extractAppRoutePatterns().some((pattern) => matchesRoutePattern(pattern, entry.path)),
      `${context} does not resolve to an explicit route or the fallback`,
    );
  }
});

test('guardian-verification route is explicit, not captured by the generic user-category route', async () => {
  const { readFile } = await import('node:fs/promises');
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const exact = app.indexOf('path="/admin/pengguna/verifikasi-wali"');
  const dynamic = app.indexOf('path="/admin/pengguna/:sub"');

  assert.ok(exact >= 0 && dynamic >= 0 && exact < dynamic);
});

test('teacher module shortcut resolves to planning and cover remains an explicit guide route', async () => {
  const { readFile } = await import('node:fs/promises');
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const alias = app.indexOf('path="/perangkat/modul-siswa" element={<Navigate to="/perencanaan?jenis=modul" replace />}');
  const cover = app.indexOf('path="/perangkat/cover" element={<PrivateShell><HalamanSubMenu /></PrivateShell>}');

  assert.ok(alias >= 0, 'student-facing module link must open the existing planning module');
  assert.ok(cover >= 0, 'cover route must render the authenticated guide explicitly');
});

test('superadmin content menu does not expose a school-admin-only planning page', async () => {
  const { readFile } = await import('node:fs/promises');
  const navigation = await readFile(new URL('../src/navigasi.js', import.meta.url), 'utf8');
  const superadminStart = navigation.indexOf('export const MENU_SUPERADMIN = [');
  const superadminEnd = navigation.indexOf('\n];', superadminStart);
  const superadminMenu = navigation.slice(superadminStart, superadminEnd);

  assert.ok(superadminStart >= 0 && superadminEnd > superadminStart);
  assert.doesNotMatch(superadminMenu, /Paket Guru.*\/admin\/perencanaan\/paket/);
});
