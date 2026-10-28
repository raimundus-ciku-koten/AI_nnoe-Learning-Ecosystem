import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL(
  '../../supabase/migrations/20261025000200_zero_cost_tenant_features.sql',
  import.meta.url,
);
const migration = await readFile(migrationPath, 'utf8');

test('removes entitlement gates from tenant feature mutations', () => {
  for (const table of [
    'students',
    'attendance_records',
    'school_announcements',
    'question_bank',
  ]) {
    assert.match(migration, new RegExp(`on public\\.${table}`, 'g'));
  }
  assert.doesNotMatch(migration, /tenant_entitlements|personal_entitlements|billing_plans/i);
  assert.doesNotMatch(migration, /Entitled .*create policy/i);
  assert.equal((migration.match(/create policy/gi) || []).length, 9);
  assert.equal((migration.match(/drop policy if exists/gi) || []).length, 9);
});

test('preserves active account, tenant, role, owner, and roster constraints', () => {
  assert.match(migration, /public\.current_user_is_active\(\)/);
  assert.match(migration, /public\.current_tenant_id\(\)/);
  assert.match(migration, /tenant\.active = true/);
  assert.match(migration, /owner_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /student\.kode_unik = attendance_records\.kode_unik/);
  assert.match(migration, /public\.current_app_role\(\)\)\s*=\s*'guru'/);
});
