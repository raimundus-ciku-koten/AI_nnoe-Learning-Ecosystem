import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../../supabase/migrations/20261025001100_school_leadership_access.sql', import.meta.url),
  'utf8',
);
const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');

function functionBody(name) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  assert.notEqual(start, -1, `${name} function exists`);
  const next = migration.indexOf('create or replace function public.', start + 1);
  return migration.slice(start, next === -1 ? migration.length : next);
}

test('homeroom assignments have no direct authenticated table access', () => {
  assert.match(migration, /create table if not exists public\.learning_classroom_homerooms/);
  assert.match(migration, /alter table public\.learning_classroom_homerooms enable row level security/);
  assert.match(migration, /revoke all on table public\.learning_classroom_homerooms\s+from public, anon, authenticated/);
  assert.match(migration, /grant all on table public\.learning_classroom_homerooms to service_role/);
  assert.doesNotMatch(migration, /grant (?:select|insert|update|delete|all).*learning_classroom_homerooms.*to authenticated/i);
});

test('school admins alone can assign active same-tenant homeroom teachers', () => {
  const assignment = functionBody('assign_learning_classroom_homeroom');
  assert.match(assignment, /current_app_role\(\) <> 'admin_sekolah'/);
  assert.match(assignment, /classroom\.tenant_id = public\.current_tenant_id\(\)/);
  assert.match(assignment, /profile\.tenant_id = classroom_tenant/);
  assert.match(assignment, /profile\.active = true/);
  assert.match(assignment, /profile\.role = 'wali_kelas'/);
  assert.match(functionBody('learning_classroom_homeroom_candidates'), /current_app_role\(\) <> 'admin_sekolah'/);
});

test('homeroom student-level reports require explicit assignment and return no private work content', () => {
  const report = functionBody('learning_classroom_homeroom_report');
  assert.match(report, /current_app_role\(\) <> 'wali_kelas'/);
  assert.match(report, /assignment\.user_id = auth\.uid\(\)/);
  assert.match(report, /assignment\.tenant_id = public\.current_tenant_id\(\)/);
  assert.match(report, /submission\.score is not null/);
  assert.doesNotMatch(report, /submission\.answer|submission\.feedback|record\.note/);
});

test('principal receives tenant aggregates only and active roles can pass the access gate', () => {
  const summary = functionBody('learning_school_principal_summary');
  assert.match(summary, /current_app_role\(\) <> 'kepala_sekolah'/);
  assert.match(summary, /public\.current_tenant_id\(\)/);
  assert.doesNotMatch(summary, /profile\.nama|student_name|returns table\s*\([^)]*student_id/i);
  assert.match(migration, /'demo', 'kepala_sekolah', 'wali_kelas'/);
});

test('privileged RPCs are not executable by public or anonymous clients', () => {
  for (const name of [
    'assign_learning_classroom_homeroom',
    'learning_classroom_homeroom_candidates',
    'learning_classroom_homeroom_admin_list',
    'learning_classroom_homeroom_classes',
    'learning_classroom_homeroom_report',
    'learning_school_principal_summary',
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}\\(`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\(`));
  }
});

test('protected role destinations render the dedicated leadership page', () => {
  assert.match(appSource, /path="\/kepala-sekolah\/ringkasan" element=\{<PrivateShell><HalamanKepemimpinanSekolah \/><\/PrivateShell>\}/);
  assert.match(appSource, /path="\/wali-kelas\/pemantauan" element=\{<PrivateShell><HalamanKepemimpinanSekolah \/><\/PrivateShell>\}/);
  assert.match(appSource, /path="\/admin\/akademik\/wali-kelas" element=\{<PrivateShell><HalamanPenugasanWaliKelas \/><\/PrivateShell>\}/);
});
