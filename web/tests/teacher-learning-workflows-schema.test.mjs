import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL(
  '../../supabase/migrations/20261026000200_teacher_learning_workflows.sql',
  import.meta.url,
), 'utf8');

test('links realization records to a selected planning package without duplicate journal storage', () => {
  assert.match(migration, /alter table public\.learning_classroom_journals/);
  assert.match(migration, /planning_package_id text/);
  assert.match(migration, /planning_document_type text/);
  assert.match(migration, /planning_unit text/);
  assert.match(migration, /learning_classroom_journals_planning_reference_check/);
  assert.match(migration, /'rpe', 'atp', 'prota', 'prosem', 'kktp', 'modul'/);
  assert.doesNotMatch(migration, /create table if not exists public\.teacher_realizations/);
});

test('persists assessment type while limiting question-bank and exam operations to assigned classes', () => {
  assert.match(migration, /assessment_type text not null default 'umum'/);
  assert.match(migration, /create or replace function public\.create_typed_online_exam/);
  assert.match(migration, /'umum', 'diagnostik', 'formatif', 'sumatif'/);
  assert.match(migration, /current_user_has_assigned_question_class/);
  assert.match(migration, /member\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /member\.member_role = 'guru'/);
  assert.match(migration, /question\.owner_id = auth\.uid\(\)/);
  assert.match(migration, /exam\.owner_id = auth\.uid\(\)/);
  assert.match(migration, /grant execute on function public\.create_typed_online_exam/);
  assert.match(migration, /grant execute on function public\.student_online_exam_categories\(\)/);
});

test('keeps individual learning profiles sourced from assigned class work rather than sensitive notes', async () => {
  const page = await readFile(new URL('../src/pages/ClassroomAssessmentReportPage.jsx', import.meta.url), 'utf8');
  assert.match(page, /location\.pathname === '\/pemantauan\/profil-siswa'/);
  assert.match(page, /row\.studentId === profileStudentId/);
  assert.match(page, /Tidak ada diagnosis, catatan konseling, intervensi/);
});
