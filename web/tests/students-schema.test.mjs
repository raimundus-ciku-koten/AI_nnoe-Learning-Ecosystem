import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL(
  '../../supabase/migrations/20261017000500_students_core.sql',
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

test('defines tenant- and owner-scoped student data with constrained personal fields', () => {
  assert.match(migration, /create table if not exists public\.students/);
  assert.match(migration, /tenant_id text not null references public\.tenants\(id\)/);
  assert.match(migration, /owner_id uuid not null references auth\.users\(id\) on delete cascade/);
  assert.match(migration, /nisn text check \(nisn is null or nisn ~ '\^\[0-9\]\{1,20\}\$'\)/);
  assert.match(migration, /jk text check \(jk is null or jk in \('L', 'P'\)\)/);
  assert.match(migration, /kode_unik text not null unique/);
  assert.match(migration, /students_owner_nisn_unique/);
});

test('keeps student writes scoped to active owner and tenant without subscriptions', () => {
  assert.match(cleanupMigration, /create policy "Active teachers create their own students"/);
  assert.match(cleanupMigration, /create policy "Active teachers update their own students"/);
  assert.match(cleanupMigration, /create policy "Active teachers delete their own students"/);
  assert.match(cleanupMigration, /owner_id = \(select auth\.uid\(\)\)/);
  assert.match(cleanupMigration, /tenant_id = \(select public\.current_tenant_id\(\)\)/);
  assert.match(cleanupMigration, /public\.current_user_is_active\(\)/);
  assert.match(cleanupMigration, /tenant\.active = true/);
  assert.doesNotMatch(cleanupPolicies, /tenant_entitlements|personal_entitlements|billing_plans|demo/i);
});

test('keeps owner and tenant immutable through column-level update grants', () => {
  const updateGrant = migration.match(/grant update \(([^)]+)\)/)?.[1] ?? '';
  assert.match(updateGrant, /nama/);
  assert.match(updateGrant, /kelas/);
  assert.match(updateGrant, /nisn/);
  assert.match(updateGrant, /jk/);
  assert.doesNotMatch(updateGrant, /owner_id|tenant_id|kode_unik|created_at|updated_at/);
});
