import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
  new URL('../../supabase/migrations/20261018001200_multi_role_identity.sql', import.meta.url),
  'utf8',
);

test('peran tambahan diprovisikan dari allowlist dan profil, bukan input browser langsung', () => {
  assert.match(migration, /user_allowlist[\s\S]*?add column if not exists roles text\[\]/);
  assert.match(migration, /profiles[\s\S]*?add column if not exists roles text\[\]/);
  assert.match(migration, /create or replace function public\.provision_auth_profile\(\)/);
  assert.match(migration, /assigned_roles := invitation\.roles/);
  assert.match(migration, /revoke all on function public\.provision_auth_profile\(\)[\s\S]*?from public, anon, authenticated/);
});

test('token hanya mengaktifkan pilihan peran jika cocok dengan peran profil tepercaya', () => {
  assert.match(migration, /selected_role := claims -> 'user_metadata' ->> 'active_role'/);
  assert.match(migration, /not \(selected_role = any \(profile_roles\)\)/);
  assert.match(migration, /'role', coalesce\(selected_role, 'unprovisioned'\)/);
  assert.match(migration, /'roles', to_jsonb\(profile_roles\)/);
  assert.match(migration, /grant execute on function public\.custom_access_token_hook\(jsonb\)\s+to supabase_auth_admin/);
  const activeFunction = migration.match(
    /create or replace function public\.current_user_is_active\(\)([\s\S]*?)\$\$;/,
  )?.[1];
  assert.ok(activeFunction);
  assert.match(activeFunction, /security definer[\s\S]*?where profile\.id = auth\.uid\(\)/);
  assert.match(activeFunction, /current_app_role\(\) in \([\s\S]*?'superadmin', 'admin_sekolah', 'operator', 'guru', 'siswa'/);
  assert.doesNotMatch(activeFunction, /kepala_sekolah/);
  assert.match(migration, /profile\.active[\s\S]*?auth\.jwt\(\)[\s\S]*?= any \(/);
});

test('spesialisasi guru terbatas pada izin guru dan bukan peran admin', () => {
  assert.match(migration, /when auth\.jwt\(\)[\s\S]*?in \('guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'\)[\s\S]*?then 'guru'/);
  assert.match(migration, /assigned_roles && array\['superadmin', 'unprovisioned'\]/);
  assert.match(migration, /not \('guru' = any \(assigned_roles\)\)/);
  assert.match(migration, /where id = p_tenant_id\s+and active = true/);
  assert.match(migration, /'roles', to_jsonb\(assigned_roles\)/);
  assert.match(migration, /grant execute on function public\.manage_platform_user\([\s\S]*?\)\s+to authenticated/);
});

test('pemilih peran klien tidak dapat mengubah tenant atau peran tanpa RPC admin', () => {
  const auth = readFileSync(new URL('../src/auth.js', import.meta.url), 'utf8');
  const userManagement = readFileSync(new URL('../src/pages/SupabasePlatformUsersPage.jsx', import.meta.url), 'utf8');

  assert.match(auth, /current\.roles\?\.includes\(role\)/);
  assert.match(auth, /supabase\.auth\.refreshSession\(\)/);
  assert.match(auth, /user\.app_metadata\?\.role !== role/);
  assert.match(auth, /const activeRole = claims\.role/);
  assert.match(userManagement, /supabase\.rpc\('manage_platform_user', request\)/);
  assert.match(userManagement, /Skema multi-peran belum diterapkan/);
  assert.match(userManagement, /role: 'admin_sekolah',\s+roles: \[\]/);
  assert.match(userManagement, /supportsRoleAssignments\s*\?\s*\[\.\.\.new Set\(\[\.\.\.form\.roles, form\.role\]\)\]\s*:\s*\[form\.role\]/);
  assert.match(userManagement, /disabled=\{!supportsRoleAssignments && !LEGACY_ROLES\.has\(value\)\}/);
});

test('pembaca profil autentikasi hanya meminta kolom yang tersedia di migrasi profil', () => {
  const auth = readFileSync(new URL('../src/auth.js', import.meta.url), 'utf8');
  const identity = readFileSync(
    new URL('../../supabase/migrations/20261016000100_identity_foundation.sql', import.meta.url),
    'utf8',
  );
  const userManagementMigration = readFileSync(
    new URL('../../supabase/migrations/20261017000100_platform_user_management.sql', import.meta.url),
    'utf8',
  );
  const profileDefinition = identity.match(
    /create table if not exists public\.profiles\s*\(([\s\S]*?)\n\);/,
  )?.[1];

  assert.ok(profileDefinition, 'definisi tabel profiles tidak ditemukan');
  const profileColumns = new Set(
    [...profileDefinition.matchAll(/^\s{2}([a-z][a-z0-9_]*)\s+/gm)]
      .map(([, column]) => column),
  );
  for (const [, alteration] of userManagementMigration.matchAll(
    /alter table public\.profiles([\s\S]*?);/gi,
  )) {
    for (const [, column] of alteration.matchAll(/add column if not exists ([a-z][a-z0-9_]*)/gi)) {
      profileColumns.add(column);
    }
  }

  const selectedColumns = auth.match(
    /\.from\('profiles'\)\s*\.select\('([^']+)'\)/,
  )?.[1]?.split(',');
  assert.ok(selectedColumns, 'proyeksi tabel profiles tidak ditemukan');
  assert.deepEqual(
    selectedColumns.filter((column) => !profileColumns.has(column)),
    [],
    'query profil meminta kolom yang tidak tersedia pada skema',
  );
  assert.match(auth, /const activeRole = claims\.role \|\| profil\.role/);
});
