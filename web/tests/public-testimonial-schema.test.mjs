import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL(
  '../../supabase/migrations/20261017000800_public_testimonials.sql',
  import.meta.url,
);
const migration = await readFile(migrationPath, 'utf8');
const submissionMigrationPath = new URL(
  '../../supabase/migrations/20261018000100_testimonial_submissions.sql',
  import.meta.url,
);
const submissionMigration = await readFile(submissionMigrationPath, 'utf8');

test('creates a public testimonial projection without source UID or pending submission fields', () => {
  assert.match(migration, /create table if not exists public\.testimonials/);
  assert.match(migration, /id uuid primary key/);
  assert.match(migration, /tenant_id text not null references public\.tenants\(id\)/);
  assert.match(migration, /display_name text not null/);
  assert.match(migration, /quote text not null/);
  assert.match(migration, /published_at timestamptz not null/);
  assert.doesNotMatch(migration, /source_id|owner_uid|rating|quote_final/i);
});

test('limits anonymous reads to published consented rows and all writes to service role', () => {
  assert.match(migration, /alter table public\.testimonials enable row level security/);
  assert.match(migration, /revoke all on table public\.testimonials from public, anon, authenticated/);
  assert.match(
    migration,
    /grant select \(\s*id, tenant_id, display_name, role, quote, consent, status\s*\) on table public\.testimonials to anon, authenticated/,
  );
  assert.doesNotMatch(
    migration,
    /grant select \([^)]*published_at[^)]*\) on table public\.testimonials to anon, authenticated/,
  );
  assert.match(migration, /grant all on table public\.testimonials to service_role/);
  assert.match(migration, /using \(status = 'published' and consent = true\)/);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete).*public\.testimonials/i);
});

test('stores testimonial submissions with owner and tenant policies', () => {
  assert.match(submissionMigration, /create table if not exists public\.testimonial_submissions/);
  assert.match(submissionMigration, /owner_id uuid not null references public\.profiles\(id\)/);
  assert.match(submissionMigration, /tenant_id text not null references public\.tenants\(id\)/);
  assert.match(submissionMigration, /status text not null default 'pending'/);
  assert.match(submissionMigration, /owners and tenant admins read testimonial submissions/i);
  assert.match(submissionMigration, /owner_id = \(select auth\.uid\(\)\)/);
  assert.match(submissionMigration, /role = \(select public\.current_app_role\(\)\)/);
  assert.match(submissionMigration, /grant update \(owner_id, tenant_id, display_name, role, quote, rating, consent\)/);
});

test('publishes only through a tenant-authorized moderation RPC', () => {
  assert.match(submissionMigration, /create or replace function public\.moderate_testimonial/);
  assert.match(submissionMigration, /security definer\s+set search_path = ''/i);
  assert.match(submissionMigration, /submission\.tenant_id <> public\.current_tenant_id\(\)/);
  assert.match(submissionMigration, /insert into public\.testimonials/);
  assert.match(submissionMigration, /grant execute on function public\.moderate_testimonial/);
});
