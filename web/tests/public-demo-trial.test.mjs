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

test('frontend tidak menyediakan signup atau formulir uji coba publik', () => {
  assert.doesNotMatch(auth, /supabase\.auth\.signUp|daftarUjiCoba/);
  assert.doesNotMatch(loginPage, /formTrial|btnDaftarTrial|trialPrompt|Coba gratis 3 hari|VITE_PUBLIC_DEMO_TRIAL_ENABLED/);
  assert.match(loginPage, /Harga paket dan kontak owner/);
});

test('konfigurasi Supabase lokal menolak pendaftaran Auth baru', async () => {
  const config = await readFile(new URL('../../supabase/config.toml', import.meta.url), 'utf8');
  assert.match(config, /\[auth\]\s+enable_signup = false/);
});

test('publisher metadata iklan tidak ikut dalam aset web publik', async () => {
  await assert.rejects(
    readFile(new URL('../public/ads.txt', import.meta.url)),
    { code: 'ENOENT' },
  );
  await assert.rejects(
    readFile(new URL('../src/components/AdSenseBanner.jsx', import.meta.url)),
    { code: 'ENOENT' },
  );
  assert.doesNotMatch(loginPage, /adsbygoogle|googlesyndication|adsense|admob/i);
});

test('callback Google tidak menambahkan hash router ke fragmen token OAuth', () => {
  assert.match(auth, /const redirectTo = `\$\{window\.location\.origin\}\$\{window\.location\.pathname\}`;/);
  assert.match(authService, /const redirectTo = `\$\{window\.location\.origin\}\$\{window\.location\.pathname\}`;/);
});

test('Firebase and Midtrans runtimes/configuration are absent while Supabase login remains', async () => {
  const removedFiles = [
    '../../functions/index.js',
    '../../firebase.json',
    '../../firestore.rules',
    '../../service-account.json.json',
    '../public/ads.txt',
    '../../supabase/functions/midtrans-checkout/index.ts',
    '../../supabase/functions/midtrans-webhook/index.ts',
  ];

  for (const path of removedFiles) {
    await assert.rejects(readFile(new URL(path, import.meta.url)), { code: 'ENOENT' }, path);
  }

  const [config, authSource] = await Promise.all([
    readFile(new URL('../../supabase/config.toml', import.meta.url), 'utf8'),
    readFile(new URL('../src/auth.js', import.meta.url), 'utf8'),
  ]);
  assert.match(config, /\[auth\]\s+enable_signup = false/);
  assert.doesNotMatch(config, /\[functions\.midtrans-/);
  assert.match(authSource, /supabase\.auth\.signInWithPassword/);
  assert.doesNotMatch(authSource, /supabase\.auth\.signUp/);
});

test('demo hanya memanipulasi data contoh lokal dengan batas lima item', () => {
  assert.match(demoPage, /additions\.current >= 5/);
  assert.match(demoPage, /window\.setInterval/);
  assert.match(demoPage, /trialExpiresAt/);
  assert.match(demoPage, /Memuat ulang halaman akan menghapus simulasi/);
  assert.doesNotMatch(demoPage, /localStorage|sessionStorage|supabase|fetch\(/i);
});
