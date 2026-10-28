import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../../supabase/migrations/20261025001400_student_guardian_relationships.sql', import.meta.url),
  'utf8',
);
const parentPage = await readFile(
  new URL('../src/pages/ParentAcademicAccessPage.jsx', import.meta.url),
  'utf8',
);

test('guardian links are tenant-bound to the roster student and active guardian profile', () => {
  assert.match(migration, /create table if not exists public\.student_guardian_links/);
  assert.match(migration, /foreign key \(student_id, tenant_id\)\s+references public\.students\(id, tenant_id\)/);
  assert.match(migration, /foreign key \(guardian_user_id, tenant_id\)\s+references public\.profiles\(id, tenant_id\)/);
  assert.match(migration, /guardian\.tenant_id = actor_tenant/);
  assert.match(migration, /guardian\.active = true/);
  assert.match(migration, /guardian\.roles && array\['ortu', 'orang_tua'\]/);
});

test('guardians cannot write links and can read only school-verified links in their tenant', () => {
  assert.match(migration, /alter table public\.student_guardian_links enable row level security/);
  assert.match(migration, /revoke all on table public\.student_guardian_links\s+from public, anon, authenticated/);
  assert.match(migration, /grant select on table public\.student_guardian_links to authenticated/);
  assert.match(migration, /status = 'verified'/);
  assert.match(migration, /guardian_user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /tenant_id = \(select public\.current_tenant_id\(\)\)/);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all).*student_guardian_links.*to authenticated/i);
  assert.match(migration, /create table if not exists public\.student_guardian_link_audit/);
  assert.match(migration, /revoke all on table public\.student_guardian_link_audit\s+from public, anon, authenticated/);
  assert.match(migration, /School admins read same-tenant guardian link audit/);
  assert.doesNotMatch(migration, /create policy[^;]+on public\.student_guardian_link_audit[^;]+for\s+(?:insert|update|delete|all)/is);
});

test('only active same-tenant school admins can verify pending links or revoke verified links', () => {
  const start = migration.indexOf('create or replace function public.manage_student_guardian_link');
  assert.notEqual(start, -1);
  const functionSql = migration.slice(start);
  assert.match(functionSql, /security definer\s+set search_path = ''/);
  assert.match(functionSql, /not public\.current_user_is_active\(\)/);
  assert.match(functionSql, /public\.current_app_role\(\) not in \('admin', 'admin_sekolah'\)/);
  assert.match(migration, /current_app_role\(\)\) in \('admin', 'admin_sekolah'\)/);
  assert.match(functionSql, /actor_tenant text := public\.current_tenant_id\(\)/);
  assert.match(functionSql, /p_action = 'verify' and current_link\.status = 'pending'/);
  assert.match(functionSql, /p_action = 'revoke' and current_link\.status = 'verified'/);
  assert.match(functionSql, /verified_by = auth\.uid\(\)/);
  assert.match(functionSql, /insert into public\.student_guardian_link_audit/);
  assert.match(migration, /revoke all on function public\.manage_student_guardian_link\(uuid, uuid, text\)\s+from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.manage_student_guardian_link\(uuid, uuid, text\)\s+to authenticated/);
});

test('relationship verification does not enable academic-data access in the parent page', () => {
  assert.match(parentPage, /Nilai dan kehadiran\s+tidak ditampilkan sampai penautan resmi dan izin akses data tersedia/);
  assert.match(parentPage, /tidak menyimpan atau menampilkan catatan akademik anak/);
  assert.doesNotMatch(migration, /create policy[^;]+on public\.(?:students|attendance_records|online_exam_attempts)[^;]+current_app_role\(\)\).*?(?:ortu|orang_tua)/is);
});
