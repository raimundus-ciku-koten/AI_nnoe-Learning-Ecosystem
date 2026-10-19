import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
  new URL('../../supabase/migrations/20261019000400_public_school_registration.sql', import.meta.url),
  'utf8',
);
const auth = readFileSync(new URL('../src/auth.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const onboarding = readFileSync(new URL('../src/pages/SchoolRegistrationPage.jsx', import.meta.url), 'utf8');
const platform = readFileSync(new URL('../src/pages/PlatformTenantsPage.jsx', import.meta.url), 'utf8');

test('permohonan sekolah terpisah dari tenant dan tidak memberi hak akses sebelum keputusan admin', () => {
  assert.match(migration, /add column if not exists school_npsn text/);
  assert.match(migration, /create unique index if not exists tenants_school_npsn_unique/);
  assert.match(migration, /create table if not exists public\.school_registration_requests/);
  assert.match(migration, /status text not null default 'pending'/);
  assert.match(migration, /terms_accepted_at timestamptz not null/);
  assert.match(migration, /create unique index[\s\S]*?where status in \('pending', 'approved'\)/);
  assert.match(migration, /grant select on table public\.school_registration_requests to authenticated/);
  assert.match(migration, /user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /applicant_profile\.role <> 'unprovisioned'/);
  assert.match(migration, /applicant_profile\.active/);
  assert.match(migration, /select 1 from public\.tenants where school_npsn = normalized_npsn/);
  assert.match(
    migration,
    /coalesce\(new\.raw_user_meta_data ->> 'signup_intent', ''\) <> 'school_registration'[\s\S]*?trial_registrations/,
  );
  assert.match(auth, /signup_intent: 'school_registration'/);
  assert.doesNotMatch(
    migration.match(/create or replace function public\.submit_school_registration_request[\s\S]*?\n\$\$;/)?.[0] || '',
    /insert into public\.tenants|insert into public\.user_allowlist|update public\.profiles/,
  );
  assert.match(migration, /previous_request ->> 'status' <> 'rejected'/);
  assert.match(migration, /status = 'pending',\s+tenant_id = null,\s+review_notes = null/);
  assert.match(migration, /platform\.school_registration\.submitted/);
});

test('pengiriman aplikasi mensyaratkan email verified dan fungsi hanya dapat dipanggil pengguna login', () => {
  assert.match(migration, /email_confirmed_at is not null/);
  assert.match(migration, /raw_app_meta_data -> 'providers'\) \? 'email'/);
  assert.match(migration, /revoke all on function public\.submit_school_registration_request\(text, text, boolean\)\s+from public, anon/);
  assert.match(migration, /grant execute on function public\.submit_school_registration_request\(text, text, boolean\)\s+to authenticated/);
  assert.match(migration, /npsn !~ '\^\[0-9\]\{8\}\$'/);
  assert.match(migration, /p_accepted_terms is distinct from true/);
  assert.match(auth, /export async function daftarSekolah/);
  assert.match(auth, /if \(!captchaToken\) throw new Error/);
  assert.doesNotMatch(auth.match(/export async function daftarSekolah[\s\S]*?\n}/)?.[0] || '', /role:|tenant_id|active_role/);
});

test('persetujuan hanya oleh superadmin aktif bermfa, lalu tenant/admin dibuat secara atomik dan diaudit', () => {
  const review = migration.match(
    /create or replace function public\.review_school_registration_request[\s\S]*?\n\$\$;/,
  )?.[0];
  assert.ok(review);
  assert.match(review, /current_user_is_active\(\)/);
  assert.match(review, /current_app_role\(\) <> 'superadmin'/);
  assert.match(review, /auth\.jwt\(\) ->> 'aal' <> 'aal2'/);
  assert.match(review, /for update/);
  assert.match(review, /insert into public\.tenants[\s\S]*?insert into public\.user_allowlist[\s\S]*?update public\.profiles/);
  assert.match(review, /registration\.npsn/);
  assert.doesNotMatch(review, /on conflict \(email\) do update/);
  assert.match(review, /insert into public\.platform_audit/);
  assert.match(migration, /grant execute on function public\.review_school_registration_request\(uuid, text, text\)\s+to authenticated/);
});

test('akun belum diprovisikan diarahkan ke pengajuan sekolah dan admin mendapat antrean review', () => {
  assert.match(app, /selectedRole === 'unprovisioned' \? '\/daftar-sekolah'/);
  assert.match(app, /if \(\(activeRole \|\| role\) === 'unprovisioned'\) return <Navigate to="\/daftar-sekolah" replace \/>/);
  assert.match(onboarding, /submit_school_registration_request/);
  assert.match(onboarding, /email sudah diverifikasi/);
  assert.match(onboarding, /request\?\.status === 'rejected'/);
  assert.match(onboarding, /Ajukan ulang permohonan/);
  assert.match(platform, /school_registration_requests/);
  assert.match(platform, /review_school_registration_request/);
  assert.match(platform, /p_decision: keputusan/);
});
