import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const migration = await readFile(
  new URL('../../supabase/migrations/20261019000200_public_demo_trial.sql', import.meta.url),
  'utf8',
);
const auth = await readFile(new URL('../src/auth.js', import.meta.url), 'utf8');
const authService = await readFile(new URL('../src/services/authService.ts', import.meta.url), 'utf8');
const demoPage = await readFile(new URL('../src/pages/TrialDemoPage.jsx', import.meta.url), 'utf8');
const loginPage = await readFile(new URL('../src/pages/login.js', import.meta.url), 'utf8');

test('trial memiliki masa berlaku tetap 72 jam dan satu catatan per email terverifikasi', () => {
  assert.match(migration, /email text primary key/);
  assert.match(migration, /user_id uuid unique references auth\.users\(id\) on delete set null/);
  assert.match(migration, /expires_at = started_at \+ interval '72 hours'/);
  assert.match(migration, /elsif new\.email_confirmed_at is not null/);
  assert.match(migration, /on conflict \(email\) do nothing/);
});

test('trial tidak dapat memperoleh role lain, akses data, atau tenant sekolah', () => {
  assert.match(migration, /user_allowlist_demo_role_isolated/);
  assert.match(migration, /profiles_demo_role_isolated/);
  assert.match(migration, /profile\.role <> 'demo'/);
  assert.match(migration, /select case when profile\.role = 'demo' then '' else profile\.tenant_id end/);
  assert.match(migration, /select profile\.active\s+and profile\.role <> 'demo'/);
  assert.match(migration, /public\.current_app_role\(\) in \(\s*'superadmin', 'admin_sekolah', 'operator', 'guru', 'siswa'/);
  assert.match(migration, /assigned_roles := array\['demo'\]/);
  assert.match(migration, /'trial-' \|\| new\.id::text/);
});

test('signup mewajibkan token CAPTCHA dan tidak menerima klaim peran dari klien', () => {
  assert.match(auth, /if \(!captchaToken\) throw new Error/);
  assert.match(auth, /captchaToken,\s+emailRedirectTo,\s+data: \{ full_name: nama \}/);
  assert.doesNotMatch(auth.match(/export async function daftarUjiCoba[\s\S]*?\n}/)?.[0] || '', /role|tenant_id|active_role/);
});

test('public demo trial tetap mati kecuali diaktifkan eksplisit dengan site key Turnstile', () => {
  assert.match(loginPage, /VITE_PUBLIC_DEMO_TRIAL_ENABLED\?\.trim\(\)\.toLowerCase\(\) === 'true'[\s\S]*?Boolean\(TURNSTILE_SITE_KEY\)/);
  assert.match(loginPage, /id="trialPrompt" \$\{DEMO_TRIAL_ENABLED \? '' : 'hidden'\}/);
  assert.match(loginPage, /modeBuatSandi \|\| \(aktif && !DEMO_TRIAL_ENABLED\)/);
  assert.match(loginPage, /if \(!DEMO_TRIAL_ENABLED\) \{\s+tampilkanError\('Pendaftaran uji coba belum dibuka di lingkungan ini\.'/);
});

test('callback Google tidak menambahkan hash router ke fragmen token OAuth', () => {
  assert.match(auth, /const redirectTo = `\$\{window\.location\.origin\}\$\{window\.location\.pathname\}`;/);
  assert.match(authService, /const redirectTo = `\$\{window\.location\.origin\}\$\{window\.location\.pathname\}`;/);
});

test('demo hanya memanipulasi data contoh lokal dengan batas lima item', () => {
  assert.match(demoPage, /additions\.current >= 5/);
  assert.match(demoPage, /window\.setInterval/);
  assert.match(demoPage, /trialExpiresAt/);
  assert.match(demoPage, /Memuat ulang halaman akan menghapus simulasi/);
  assert.doesNotMatch(demoPage, /localStorage|sessionStorage|supabase|fetch\(/i);
});
