import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isMenuPathDisabled } from '../src/services/menuAccessPolicy.js';
import { menuUntukPeran } from '../src/navigasi.js';

const root = new URL('../../', import.meta.url);
const migrationMenu = await readFile(
  new URL('supabase/migrations/20261025000300_superadmin_user_menu_access.sql', root),
  'utf8',
);
const migrationConsent = await readFile(
  new URL('supabase/migrations/20261025000400_user_integration_consent.sql', root),
  'utf8',
);
const migrationMenuTargetGuard = await readFile(
  new URL('supabase/migrations/20261025000500_protect_superadmin_menu_access_targets.sql', root),
  'utf8',
);

describe('kebijakan pembatasan menu per akun', () => {
  it('memblokir grup dan submenu hingga ke rute turunan', () => {
    assert.equal(isMenuPathDisabled(new Set(['group:chat']), 'guru', '/asisten'), true);
    assert.equal(isMenuPathDisabled(new Set(['path:/asisten']), 'guru', '/asisten'), true);
    assert.equal(isMenuPathDisabled(new Set(['path:/asisten']), 'guru', '/chat'), false);
    assert.equal(isMenuPathDisabled(new Set(['path:/perencanaan']), 'guru', '/perencanaan', '?jenis=modul'), true);
  });

  it('menghasilkan key grup dan rute yang diterima oleh batasan database', () => {
    const roles = [
      'superadmin', 'admin_sekolah', 'operator', 'guru', 'siswa',
      'ortu', 'kepala_sekolah', 'wali_kelas', 'demo',
    ];
    for (const role of roles) {
      for (const group of menuUntukPeran(role)) {
        assert.match(`group:${group.id}`, /^group:[a-z0-9][a-z0-9-]*$/);
        for (const item of group.item) {
          assert.match(`path:${item.path}`, /^path:\/[a-z0-9][a-z0-9/_-]*$/);
        }
      }
    }
  });

  it('membatasi perubahan ke superadmin aktif melalui RPC dan menyimpan audit', () => {
    assert.match(migrationMenu, /public\.current_user_is_active\(\)/);
    assert.match(migrationMenu, /public\.current_app_role\(\) <> 'superadmin'/);
    assert.match(migrationMenu, /insert into public\.platform_audit/i);
    assert.match(migrationMenu, /create policy "Users read their own menu restrictions"/);
    assert.match(migrationMenu, /user_id = \(select auth\.uid\(\)\)/);
    assert.match(migrationMenu, /revoke all on table public\.user_menu_access from public, anon, authenticated/);
    assert.match(migrationMenuTargetGuard, /'superadmin' = any\(coalesce\(target_roles, '\{\}'::text\[\]\)\)/);
  });
});

describe('persetujuan integrasi pengguna', () => {
  it('mencatat persetujuan individual tanpa meminta Gmail atau scope yang belum didukung', () => {
    assert.match(migrationConsent, /selected_services <@ array\['drive', 'sheets', 'meet', 'calendar', 'tasks'\]/);
    assert.match(migrationConsent, /public\.current_user_is_active\(\)/);
    assert.match(migrationConsent, /insert into public\.platform_audit/i);
    assert.doesNotMatch(migrationConsent, /gmail/i);
  });
});
