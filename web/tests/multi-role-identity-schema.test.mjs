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

  assert.match(auth, /\.from\('profiles'\)\s*\.select\('id,email,nama,role,tenant_id,active,photo_url'\)/);
  assert.doesNotMatch(auth, /\.select\([^)]*logo_sekolah/);
  assert.match(auth, /current\.roles\?\.includes\(role\)/);
  assert.match(auth, /supabase\.auth\.refreshSession\(\)/);
  assert.match(auth, /user\.app_metadata\?\.role !== role/);
  assert.match(auth, /const activeRole = claims\.role/);
  assert.match(userManagement, /supabase\.rpc\('manage_platform_user', request\)/);
  assert.match(userManagement, /Skema multi-peran belum diterapkan/);
  assert.match(userManagement, /role: '',\s+roles: \[\]/);
  assert.match(userManagement, /Pilih peran utama yang didukung sebelum menyimpan pengguna/);
  assert.match(userManagement, /<select\s+required\s+value=\{form\.role\}/);
  assert.match(userManagement, /user\.role === 'unprovisioned' \? '' : user\.role/);
  assert.match(userManagement, /supportsRoleAssignments\s*\?\s*\[\.\.\.new Set\(\[\.\.\.form\.roles, form\.role\]\)\]\s*:\s*\[form\.role\]/);
  assert.match(userManagement, /disabled=\{!supportsRoleAssignments && !LEGACY_ROLES\.has\(value\)\}/);
});
