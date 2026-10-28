import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const migration = await readFile(
  new URL('../../supabase/migrations/20261025001300_student_roster_assignment.sql', import.meta.url),
  'utf8',
);

test('only authorized school admins can enumerate active teacher roster owners', () => {
  assert.match(migration, /create or replace function public\.student_roster_teacher_candidates/);
  assert.match(migration, /security definer\s+set search_path = ''/);
  assert.match(migration, /actor_role not in \('admin', 'admin_sekolah', 'operator', 'superadmin'\)/);
  assert.match(migration, /profile\.tenant_id = p_tenant_id\s+and profile\.active = true/);
  assert.match(migration, /'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'/);
  assert.match(migration, /actor_role <> 'superadmin'\s+and p_tenant_id <> public\.current_tenant_id\(\)/);
});

test('tenant administrators can manage only active same-tenant teacher rosters', () => {
  assert.match(migration, /School managers read tenant student rosters/);
  assert.match(migration, /School managers assign rosters to active teachers/);
  assert.match(migration, /School managers update tenant student rosters/);
  assert.match(migration, /School managers delete tenant student rosters/);
  assert.match(migration, /teacher\.tenant_id = students\.tenant_id\s+and teacher\.active = true/);
  assert.match(migration, /tenant\.id = students\.tenant_id\s+and tenant\.active = true/);
  assert.match(migration, /entitlement\.status in \('trial', 'active'\)/);
  assert.match(migration, /\(select public\.current_app_role\(\)\) = 'superadmin'\s+or tenant_id = \(select public\.current_tenant_id\(\)\)/);
});
