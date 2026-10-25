import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../../supabase/migrations/20261025001500_assessment_role_access_and_admin_overview.sql', import.meta.url),
  'utf8',
);

test('teacher assessment access includes specialist roles but preserves ownership and tenant boundaries', () => {
  assert.match(
    migration,
    /current_user_can_manage_teacher_assessments[\s\S]+?current_app_role\(\)\) in \([\s\S]*?'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'/,
  );
  for (const role of ['guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler']) {
    assert.match(migration, new RegExp(`'${role}'`));
  }
  assert.match(migration, /owner_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /tenant_id = \(select public\.current_tenant_id\(\)\)/);
  assert.match(migration, /plan\.allowed_role = 'guru'/);
  assert.match(migration, /school_admin_online_exam_overview/);
});

test('school admin overview is active-tenant scoped and returns no student-identifying fields', () => {
  const functionStart = migration.indexOf('create or replace function public.school_admin_online_exam_overview()');
  assert.notEqual(functionStart, -1);
  const functionSql = migration.slice(functionStart);
  assert.match(functionSql, /security definer\s+set search_path = ''/);
  assert.match(functionSql, /current_app_role\(\)\) not in \('admin', 'admin_sekolah'\)/);
  assert.match(functionSql, /tenant\.id = \(select public\.current_tenant_id\(\)\)/);
  assert.match(functionSql, /exam\.tenant_id = \(select public\.current_tenant_id\(\)\)/);
  assert.match(functionSql, /limit 200/);
  assert.doesNotMatch(functionSql, /student_name|student\.nama|attempt\.answers|attempt\.score/);
  assert.match(functionSql, /revoke all on function public\.school_admin_online_exam_overview\(\)\s+from public, anon, authenticated/);
  assert.match(functionSql, /grant execute on function public\.school_admin_online_exam_overview\(\)\s+to authenticated/);
});

test('all teacher-owned exam RPCs use the shared specialist-aware authorization check', () => {
  for (const functionName of [
    'create_online_exam',
    'teacher_online_exam_results',
    'teacher_online_exam_overview',
    'teacher_online_exam_essay_reviews',
    'review_online_exam_essays',
  ]) {
    const start = migration.indexOf(`create or replace function public.${functionName}(`);
    assert.notEqual(start, -1, `${functionName} is recreated for deployed databases`);
    const next = migration.indexOf('create or replace function public.', start + 1);
    const functionSql = migration.slice(start, next < 0 ? undefined : next);
    assert.match(functionSql, /current_user_can_manage_teacher_assessments\(\)/, functionName);
    assert.doesNotMatch(functionSql, /current_app_role\(\)\) <> 'guru'/, functionName);
  }
});
