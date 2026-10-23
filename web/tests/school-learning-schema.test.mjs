import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL(
  '../../supabase/migrations/20261023000300_school_learning_items.sql',
  import.meta.url,
), 'utf8');

test('defines bounded class-specific schedules, tasks, and text materials', () => {
  assert.match(migration, /create table if not exists public\.school_learning_items/);
  assert.match(migration, /kind in \('schedule', 'task', 'material'\)/);
  assert.match(migration, /class_name text not null/);
  assert.match(migration, /title text not null check/);
  assert.match(migration, /body text not null check/);
  assert.match(migration, /starts_at timestamptz/);
  assert.match(migration, /due_at timestamptz/);
  assert.match(migration, /published boolean not null default false/);
});

test('restricts management to active tenant school staff and prevents client role changes', () => {
  assert.match(migration, /drop policy if exists "Active teachers read their own student roster"/);
  assert.match(migration, /owner_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /alter table public\.school_learning_items enable row level security/);
  assert.match(migration, /revoke all on table public\.school_learning_items from public, anon, authenticated/);
  assert.match(migration, /grant insert \(tenant_id, author_id, class_name, kind, title, body, starts_at, due_at, published\)/);
  assert.match(migration, /and tenant_id = \(select public\.current_tenant_id\(\)\)/);
  assert.match(migration, /and author_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /'admin_sekolah', 'operator', 'guru', 'guru_bk'/);
  const updatePolicy = migration.slice(
    migration.indexOf('create policy "Active school staff update learning items"'),
    migration.indexOf('drop policy if exists "Active school staff delete learning items"'),
  );
  const deletePolicy = migration.slice(
    migration.indexOf('create policy "Active school staff delete learning items"'),
    migration.indexOf('create or replace function public.student_learning_feed()'),
  );
  assert.match(updatePolicy, /author_id = \(select auth\.uid\(\)\)/);
  assert.match(deletePolicy, /author_id = \(select auth\.uid\(\)\)/);
  const createPolicy = migration.slice(
    migration.indexOf('create policy "Active school staff create learning items"'),
    migration.indexOf('drop policy if exists "Active school staff update learning items"'),
  );
  assert.match(createPolicy, /student\.owner_id = \(select auth\.uid\(\)\)/);
  assert.match(createPolicy, /student\.kelas = school_learning_items\.class_name/);
});

test('serves only published items for the authenticated student linked to the matching class', () => {
  assert.match(migration, /create or replace function public\.student_learning_feed\(\)/);
  assert.match(migration, /security definer\s+set search_path = ''/);
  assert.match(migration, /public\.student_account_links as link\s+on link\.user_id = auth\.uid\(\)/);
  assert.match(migration, /student\.kelas = item\.class_name/);
  assert.match(migration, /item\.published = true/);
  assert.match(migration, /revoke all on function public\.student_learning_feed\(\) from public, anon/);
  assert.doesNotMatch(migration, /tenant_entitlements|personal_entitlements|billing_plans|service_role key/i);
});
