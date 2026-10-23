import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL(
  '../../supabase/migrations/20261023000500_student_attendance_history.sql',
  import.meta.url,
), 'utf8');

test('exposes only bounded attendance fields through a server-validated student feed', () => {
  assert.match(migration, /create or replace function public\.student_attendance_history\(\)/);
  assert.match(migration, /security definer\s+set search_path = ''/);
  assert.match(migration, /current_app_role\(\)\) <> 'siswa'/);
  assert.match(migration, /tenant\.active = true/);
  assert.match(migration, /link\.user_id = auth\.uid\(\)/);
  assert.match(migration, /link\.student_id = attendance\.student_id/);
  assert.match(migration, /attendance\.tenant_id = \(select public\.current_tenant_id\(\)\)/);
  assert.match(migration, /limit 366/);
  assert.doesNotMatch(migration, /nisn|kode_unik|nama|owner_id/);
  assert.match(migration, /revoke all on function public\.student_attendance_history\(\) from public, anon/);
});
