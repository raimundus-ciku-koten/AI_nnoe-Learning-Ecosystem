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
