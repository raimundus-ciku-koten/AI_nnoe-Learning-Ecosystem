import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL(
  '../../supabase/migrations/20261017000500_students_core.sql',
  import.meta.url,
);
const migration = await readFile(migrationPath, 'utf8');

test('defines tenant- and owner-scoped student data with constrained personal fields', () => {
  assert.match(migration, /create table if not exists public\.students/);
  assert.match(migration, /tenant_id text not null references public\.tenants\(id\)/);
  assert.match(migration, /owner_id uuid not null references auth\.users\(id\) on delete cascade/);
  assert.match(migration, /nisn text check \(nisn is null or nisn ~ '\^\[0-9\]\{1,20\}\$'\)/);
  assert.match(migration, /jk text check \(jk is null or jk in \('L', 'P'\)\)/);
  assert.match(migration, /kode_unik text not null unique/);
  assert.match(migration, /students_owner_nisn_unique/);
});

test('enables RLS, scopes records to active owner and tenant, and gates writes by entitlement', () => {
  assert.match(migration, /alter table public\.students enable row level security/);
  assert.match(migration, /owner_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /tenant_id = \(select public\.current_tenant_id\(\)\)/);
  assert.match(migration, /public\.current_user_is_active\(\)/);
  assert.match(migration, /entitlement\.status in \('trial', 'active'\)/);
  assert.match(migration, /entitlement\.valid_until is null or entitlement\.valid_until > now\(\)/);
  assert.match(migration, /revoke all on table public\.students from anon, authenticated/);
});

test('keeps owner and tenant immutable through column-level update grants', () => {
  const updateGrant = migration.match(/grant update \(([^)]+)\)/)?.[1] ?? '';
  assert.match(updateGrant, /nama/);
  assert.match(updateGrant, /kelas/);
  assert.match(updateGrant, /nisn/);
  assert.match(updateGrant, /jk/);
  assert.doesNotMatch(updateGrant, /owner_id|tenant_id|kode_unik|created_at|updated_at/);
});
