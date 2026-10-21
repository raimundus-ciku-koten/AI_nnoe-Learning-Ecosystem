import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL(
  '../../supabase/migrations/20261017000900_school_announcements.sql',
  import.meta.url,
);
const migration = await readFile(migrationPath, 'utf8');

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

test('enables RLS with active-member reads and tenant-staff mutations', () => {
  assert.match(migration, /alter table public\.school_announcements enable row level security/);
  assert.match(migration, /public\.current_user_is_active\(\)/);
  assert.match(migration, /public\.current_app_role\(\).*'superadmin'/s);
  assert.match(migration, /'admin_sekolah', 'operator', 'guru', 'siswa', 'ortu'/);
  assert.match(migration, /'admin_sekolah', 'operator'/);
  assert.match(migration, /entitlement\.status in \('trial', 'active'\)/);
  assert.match(migration, /entitlement\.valid_until is null or entitlement\.valid_until > now\(\)/);
});

test('restricts columns so clients cannot change tenant, author or creation time', () => {
  assert.match(migration, /revoke all on table public\.school_announcements from public, anon, authenticated/);
  assert.match(migration, /grant insert \(tenant_id, author_id, title, body\)/);
  assert.match(migration, /grant update \(title, body\)/);
  assert.doesNotMatch(migration, /grant insert \([^)]*created_at/);
  assert.doesNotMatch(migration, /grant update \([^)]*tenant_id|grant update \([^)]*author_id/);
});
