import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../../supabase/migrations/20261024000100_learning_classrooms.sql', import.meta.url),
  'utf8',
);
const materialsMigration = await readFile(
  new URL('../../supabase/migrations/20261024000200_learning_classroom_materials.sql', import.meta.url),
  'utf8',
);
const assignmentsMigration = await readFile(
  new URL('../../supabase/migrations/20261024000300_learning_classroom_assignments.sql', import.meta.url),
  'utf8',
);
const quizzesMigration = await readFile(
  new URL('../../supabase/migrations/20261024000400_learning_classroom_quizzes.sql', import.meta.url),
  'utf8',
);
const attendanceMigration = await readFile(
  new URL('../../supabase/migrations/20261024000500_learning_classroom_attendance.sql', import.meta.url),
  'utf8',
);
const journalsMigration = await readFile(
  new URL('../../supabase/migrations/20261025000800_learning_classroom_journals.sql', import.meta.url),
  'utf8',
);

test('learning classrooms are tenant-scoped and protected by RLS', () => {
  assert.match(migration, /create table if not exists public\.learning_classrooms/);
  assert.match(migration, /create table if not exists public\.classroom_members/);
  assert.match(migration, /alter table public\.learning_classrooms enable row level security/);
  assert.match(migration, /alter table public\.classroom_members enable row level security/);
  assert.match(migration, /public\.current_user_is_active\(\)/);
  assert.match(migration, /public\.current_tenant_id\(\)/);
  assert.match(migration, /member\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /grant select on table public\.learning_classrooms, public\.classroom_members/);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all) on table public\.learning_classrooms, public\.classroom_members to authenticated/i);
});

test('teacher classroom journals are tenant, assignment, role, and author scoped', () => {
  assert.match(journalsMigration, /create table if not exists public\.learning_classroom_journals/);
  assert.match(journalsMigration, /foreign key \(classroom_id, tenant_id\)/);
  assert.match(journalsMigration, /author_id uuid not null default auth\.uid\(\)/);
  assert.match(journalsMigration, /lesson_date date not null/);
  assert.match(journalsMigration, /topic text not null check/);
  assert.match(journalsMigration, /objectives text not null check/);
  assert.match(journalsMigration, /activities text not null check/);
  assert.match(journalsMigration, /alter table public\.learning_classroom_journals enable row level security/);
  assert.match(journalsMigration, /member\.member_role = 'guru'/);
  assert.match(journalsMigration, /member\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(journalsMigration, /public\.current_user_is_active\(\)/);
  assert.match(journalsMigration, /public\.current_tenant_id\(\)/);
  assert.match(journalsMigration, /author_id = \(select auth\.uid\(\)\)/);
  assert.match(journalsMigration, /'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'/);
  assert.match(journalsMigration, /create policy "Assigned teachers update own classroom journals"/);
  assert.doesNotMatch(journalsMigration, /grant all on table public\.learning_classroom_journals\s+to authenticated/i);
});

test('only tenant operators, school admins, and superadmins can create rooms and assign active same-tenant accounts', () => {
  assert.match(migration, /create or replace function public\.create_learning_classroom/);
  assert.match(migration, /actor_role not in \('admin_sekolah', 'operator', 'superadmin'\)/);
  assert.match(migration, /profile\.tenant_id = p_tenant_id/);
  assert.match(migration, /profile\.active = true/);
  assert.match(migration, /cardinality\(p_student_ids\) not between 1 and 1000/);
  assert.match(migration, /profile\.role = 'siswa'/);
  assert.match(migration, /public\.learning_classroom_candidates\(text\)/);
  assert.match(migration, /profile\.role in \(\s*'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler', 'siswa'/);
  assert.doesNotMatch(migration, /create table if not exists public\.(?:payments|plans)/);
});

test('candidate lookup exposes only limited active tenant account fields to classroom managers', () => {
  assert.match(migration, /returns table \(id uuid, nama text, role text\)/);
  assert.match(migration, /actor_role not in \('admin_sekolah', 'operator', 'superadmin'\)/);
  assert.match(migration, /profile\.tenant_id = p_tenant_id/);
  assert.match(migration, /profile\.active = true/);
  assert.match(migration, /revoke all on function public\.learning_classroom_candidates\(text\)\s+from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.learning_classroom_candidates\(text\)\s+to authenticated/);
});

test('class materials enforce active tenant membership and assigned-teacher writes with RLS', () => {
  assert.match(materialsMigration, /create table if not exists public\.learning_classroom_materials/);
  assert.match(materialsMigration, /foreign key \(classroom_id, tenant_id\)/);
  assert.match(materialsMigration, /alter table public\.learning_classroom_materials enable row level security/);
  assert.match(materialsMigration, /public\.current_user_is_active\(\)/);
  assert.match(materialsMigration, /member\.member_role = 'guru'/);
  assert.match(materialsMigration, /created_by = \(select auth\.uid\(\)\)/);
  assert.match(materialsMigration, /create policy "Active classroom members read materials"/);
  assert.match(materialsMigration, /create policy "Assigned teachers create classroom materials"/);
  assert.match(materialsMigration, /create policy "Assigned teachers update their classroom materials"/);
  assert.match(materialsMigration, /create policy "Assigned teachers delete their classroom materials"/);
  assert.match(materialsMigration, /created_by uuid not null default auth\.uid\(\)/);
  assert.match(materialsMigration, /grant select, insert, update, delete on table public\.learning_classroom_materials\s+to authenticated/);
});

test('class assignments and grading require active class membership and protected RPCs', () => {
  assert.match(assignmentsMigration, /create table if not exists public\.learning_classroom_assignments/);
  assert.match(assignmentsMigration, /create table if not exists public\.learning_classroom_submissions/);
  assert.match(assignmentsMigration, /create policy "Active classroom members read assignments"/);
  assert.match(assignmentsMigration, /create policy "Assigned teachers create assignments"/);
  assert.match(assignmentsMigration, /create policy "Students and assigned teachers read submissions"/);
  assert.match(assignmentsMigration, /create or replace function public\.submit_learning_classroom_assignment/);
  assert.match(assignmentsMigration, /public\.current_app_role\(\) <> 'siswa'/);
  assert.match(assignmentsMigration, /member\.member_role = 'siswa'/);
  assert.match(assignmentsMigration, /assignment_row\.due_at <= now\(\)/);
  assert.match(assignmentsMigration, /assignment-already-graded/);
  assert.match(assignmentsMigration, /create or replace function public\.grade_learning_classroom_submission/);
  assert.match(assignmentsMigration, /member\.member_role = 'guru'/);
  assert.match(assignmentsMigration, /create or replace function public\.learning_classroom_teacher_submissions/);
  assert.match(assignmentsMigration, /profile\.nama/);
  assert.match(assignmentsMigration, /revoke all on function public\.submit_learning_classroom_assignment\(uuid, text\)/);
  assert.match(assignmentsMigration, /revoke all on function public\.grade_learning_classroom_submission\(uuid, numeric, text\)/);
  assert.match(assignmentsMigration, /revoke all on function public\.learning_classroom_teacher_submissions\(uuid\)/);
  assert.doesNotMatch(assignmentsMigration, /grant insert, update, delete on table public\.learning_classroom_submissions to authenticated/);
});

test('quiz answer keys stay private and submission is scored server-side once', () => {
  assert.match(quizzesMigration, /create table if not exists public\.learning_classroom_quiz_questions/);
  assert.match(quizzesMigration, /correct_choice smallint/);
  assert.match(quizzesMigration, /revoke all on table public\.learning_classroom_quizzes,[\s\S]*from public, anon, authenticated/);
  assert.doesNotMatch(quizzesMigration, /grant select[^;]*learning_classroom_quiz_questions[^;]*authenticated/i);
  assert.match(quizzesMigration, /create or replace function public\.learning_classroom_quiz_questions_for_student/);
  assert.match(quizzesMigration, /returns table \(question_id uuid, "position" smallint, prompt text, choices jsonb\)/);
  assert.doesNotMatch(
    quizzesMigration.match(/create or replace function public\.learning_classroom_quiz_questions_for_student[\s\S]*?\$\$;/)?.[0] || '',
    /correct_choice/,
  );
  assert.match(quizzesMigration, /create or replace function public\.submit_learning_classroom_quiz/);
  assert.match(quizzesMigration, /round\(correct_total \* 100\.0 \/ question_total, 2\)/);
  assert.match(quizzesMigration, /quiz-already-submitted/);
  assert.match(quizzesMigration, /quiz-deadline-passed/);
  assert.match(quizzesMigration, /create or replace function public\.learning_classroom_teacher_quiz_results/);
  assert.match(quizzesMigration, /member\.member_role = 'siswa'/);
  assert.match(quizzesMigration, /member\.member_role = 'guru'/);
  assert.match(quizzesMigration, /create or replace function public\.create_learning_classroom_quiz/);
  assert.match(quizzesMigration, /correctChoice/);
  assert.match(quizzesMigration, /public\.current_tenant_id\(\)/);
  assert.match(quizzesMigration, /quiz-already-submitted/);
  assert.match(quizzesMigration, /revoke all on function public\.submit_learning_classroom_quiz\(uuid, jsonb\)/);
  assert.match(quizzesMigration, /grant execute on function public\.submit_learning_classroom_quiz\(uuid, jsonb\)\s+to authenticated/);
});

test('class attendance is tenant-scoped and students can only read their own records', () => {
  assert.match(attendanceMigration, /create table if not exists public\.learning_classroom_attendance_sessions/);
  assert.match(attendanceMigration, /create table if not exists public\.learning_classroom_attendance/);
  assert.match(attendanceMigration, /unique \(classroom_id, attendance_date\)/);
  assert.match(attendanceMigration, /alter table public\.learning_classroom_attendance_sessions enable row level security/);
  assert.match(attendanceMigration, /alter table public\.learning_classroom_attendance enable row level security/);
  assert.match(attendanceMigration, /student_id = \(select auth\.uid\(\)\)/);
  assert.match(attendanceMigration, /member\.member_role = 'guru'/);
  assert.match(attendanceMigration, /member\.member_role = 'siswa'/);
  assert.match(attendanceMigration, /tenant\.active = true/);
  assert.match(attendanceMigration, /status text not null check \(status in \('hadir', 'izin', 'sakit', 'alpa'\)\)/);
  assert.match(attendanceMigration, /create or replace function public\.learning_classroom_attendance_roster/);
  assert.match(attendanceMigration, /create or replace function public\.record_learning_classroom_attendance/);
  assert.match(attendanceMigration, /jsonb_typeof\(p_records\) is distinct from 'array'/);
  assert.match(attendanceMigration, /jsonb_array_length\(p_records\) > 1000/);
  assert.match(attendanceMigration, /status_value is null or status_value not in/);
  assert.match(attendanceMigration, /duplicate-attendance-student/);
  assert.match(attendanceMigration, /attendance-roster-incomplete/);
  assert.match(attendanceMigration, /revoke all on table public\.learning_classroom_attendance_sessions,[\s\S]*from public, anon, authenticated/);
  assert.doesNotMatch(attendanceMigration, /grant insert, update, delete on table public\.learning_classroom_attendance(?:_sessions)?\s+to authenticated/i);
  assert.match(attendanceMigration, /grant execute on function public\.record_learning_classroom_attendance\(uuid, jsonb\)\s+to authenticated/);
});
