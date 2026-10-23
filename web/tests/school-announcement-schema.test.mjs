import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL(
  '../../supabase/migrations/20261017000900_school_announcements.sql',
  import.meta.url,
);
const migration = await readFile(migrationPath, 'utf8');
const cleanupMigration = await readFile(new URL(
  '../../supabase/migrations/20261023000100_remove_billing_signup_demo.sql',
  import.meta.url,
), 'utf8');
const cleanupPolicies = cleanupMigration.slice(
  cleanupMigration.indexOf('create policy'),
  cleanupMigration.indexOf('create or replace function'),
);

test('defines tenant-scoped announcement fields with bounded title and body', () => {
  assert.match(migration, /create table if not exists public\.school_announcements/);
  assert.match(migration, /id uuid primary key default gen_random_uuid\(\)/);
  assert.match(migration, /tenant_id text not null references public\.tenants\(id\)/);
  assert.match(migration, /author_id uuid not null references auth\.users\(id\)/);
  assert.match(migration, /title text not null check/);
  assert.match(migration, /body text not null check/);
  assert.match(migration, /created_at timestamptz not null default now\(\)/);
  assert.doesNotMatch(migration, /legacy_uid|source_id|firebase/i);
});

test('keeps announcements scoped to active members without subscription or demo access', () => {
  assert.match(cleanupMigration, /create policy "Active school members and superadmins read announcements"/);
  assert.match(cleanupMigration, /create policy "Active school staff create announcements"/);
  assert.match(cleanupMigration, /create policy "Active school staff update announcements"/);
  assert.match(cleanupMigration, /create policy "Active school staff delete announcements"/);
  assert.match(cleanupMigration, /public\.current_user_is_active\(\)/);
  assert.match(cleanupMigration, /public\.current_app_role\(\).*'superadmin'/s);
  assert.match(cleanupMigration, /'admin_sekolah', 'operator', 'guru', 'siswa', 'ortu'/);
  assert.match(cleanupMigration, /'admin_sekolah', 'operator'/);
  assert.doesNotMatch(cleanupPolicies, /tenant_entitlements|personal_entitlements|billing_plans|demo/i);
});

test('restricts columns so clients cannot change tenant, author or creation time', () => {
  assert.match(migration, /revoke all on table public\.school_announcements from public, anon, authenticated/);
  assert.match(migration, /grant insert \(tenant_id, author_id, title, body\)/);
  assert.match(migration, /grant update \(title, body\)/);
  assert.doesNotMatch(migration, /grant insert \([^)]*created_at/);
  assert.doesNotMatch(migration, /grant update \([^)]*tenant_id|grant update \([^)]*author_id/);
});
