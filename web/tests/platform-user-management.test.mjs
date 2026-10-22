import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const inviteFunction = readFileSync(
  new URL('../../supabase/functions/platform-user-invite/index.ts', import.meta.url),
  'utf8',
);
const functionConfig = readFileSync(new URL('../../supabase/config.toml', import.meta.url), 'utf8');
const activeMigration = readFileSync(
  new URL('../../supabase/migrations/20261019000300_live_profile_active_check.sql', import.meta.url),
  'utf8',
);
const usersPage = readFileSync(new URL('../src/pages/SupabasePlatformUsersPage.jsx', import.meta.url), 'utf8');
const navigation = readFileSync(new URL('../src/navigasi.js', import.meta.url), 'utf8');

test('undangan akun hanya dikirim oleh superadmin aktif untuk email allowlist aktif', () => {
  assert.match(functionConfig, /\[functions\.platform-user-invite\]\s+verify_jwt = true/);
  assert.match(inviteFunction, /supabase\.auth\.getUser\(token\)/);
  assert.match(inviteFunction, /supabase\.auth\.getClaims\(token\)/);
  assert.match(inviteFunction, /claimsData\.claims\.aal !== 'aal2'/);
  assert.ok(
    inviteFunction.indexOf("claimsData.claims.aal !== 'aal2'")
      < inviteFunction.indexOf("supabase.auth.admin.inviteUserByEmail"),
  );
  assert.match(inviteFunction, /actor\?\.role !== 'superadmin' \|\| actor\.active !== true/);
  assert.match(inviteFunction, /allowlistEntry\?\.active/);
  assert.match(inviteFunction, /allowlistEntry\.role === 'superadmin'/);
  assert.match(inviteFunction, /auth\.admin\.inviteUserByEmail\(email/);
  assert.doesNotMatch(usersPage, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(usersPage, /const \[emailInput, setEmailInput\] = useState\(''\);/);
  assert.doesNotMatch(usersPage, /kotenraimundusc@gmail\.com/);
});

test('menonaktifkan akun melalui RPC dan cek akses memakai profil terbaru', () => {
  assert.match(usersPage, /p_active: active/);
  assert.match(usersPage, /user\.active \? 'Nonaktifkan akses' : 'Aktifkan akses'/);
  assert.match(usersPage, /Profil dan riwayatnya akan tetap disimpan/);
  assert.match(activeMigration, /function public\.current_user_is_active\(\)[\s\S]*?security definer/);
  assert.match(activeMigration, /profile\.active[\s\S]*?profile\.role <> 'demo'/);
  assert.match(activeMigration, /public\.current_app_role\(\) in \([\s\S]*?'admin_sekolah', 'superadmin'[\s\S]*?auth\.jwt\(\) ->> 'aal' = 'aal2'/);
  assert.match(activeMigration, /where profile\.id = auth\.uid\(\)/);
});

test('undangan dijalankan setelah penyimpanan akses dan menu akun tetap ada bagi superadmin', () => {
  const saveUser = usersPage.slice(
    usersPage.indexOf('async function saveUser'),
    usersPage.indexOf('async function ubahStatusAkses'),
  );
  assert.match(saveUser, /supabase\.rpc\('manage_platform_user', request\)[\s\S]*?data\?\.invitation_required[\s\S]*?kirimUndanganPlatform/);
  assert.match(navigation, /export const MENU_SUPERADMIN = \[[\s\S]*?tautan\('Pengguna Supabase', '\/platform\/supabase-users'/);
});
