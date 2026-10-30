import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL(
  '../../supabase/migrations/20261018001100_online_assessments.sql',
  import.meta.url,
);
const migration = await readFile(migrationPath, 'utf8');
const schoolAdminOverviewMigration = await readFile(new URL(
  '../../supabase/migrations/20261030000300_school_admin_exam_overview.sql',
  import.meta.url,
), 'utf8');
const studentPagePath = new URL(
  '../src/pages/OnlineAssessmentPage.jsx',
  import.meta.url,
);
const studentPage = await readFile(studentPagePath, 'utf8');

test('keeps roster account links and exam answer keys inaccessible to browser roles', () => {
  assert.match(migration, /create table if not exists public\.student_account_links/);
  assert.match(migration, /user_id uuid not null unique references auth\.users/);
  assert.match(migration, /student\.tenant_id = \(select public\.current_tenant_id\(\)\)/);
  assert.match(migration, /profile\.role = 'siswa'/);
  assert.match(migration, /profile\.active = true/);
  assert.match(migration, /public\.unlinked_student_roster\(\)/);
  assert.match(migration, /right\(student\.nisn, 4\)/);
  assert.match(migration, /public\.unlinked_student_accounts\(\)/);
  assert.match(migration, /public\.linked_student_accounts\(\)/);
  assert.match(migration, /public\.unlink_student_account\(uuid\)/);
  assert.match(migration, /student_account_link_audit/);
  assert.match(migration, /public\.link_student_account\(uuid, uuid\)/);
  assert.match(migration, /create table if not exists public\.online_exam_items/);
  assert.match(migration, /correct_answer text not null/);
  assert.match(migration, /revoke all on table public\.student_account_links, public\.student_account_link_audit, public\.online_exams,\s*public\.online_exam_items, public\.online_exam_attempts\s*from public, anon, authenticated/);
});

test('limits question creation to the teacher and snapshots a private answer key', () => {
  assert.match(migration, /public\.create_online_exam\(/);
  assert.match(migration, /public\.current_app_role\(\)\) <> 'guru'/);
  assert.match(migration, /question\.owner_id = auth\.uid\(\)/);
  assert.match(migration, /question\.kelas = btrim\(p_kelas\)/);
  assert.match(migration, /question\.jawaban/);
  assert.match(migration, /'choices', item\.choices/);
  assert.doesNotMatch(migration, /'correct_answer'\s*,\s*item\.correct_answer/);
  assert.match(migration, /public\.teacher_online_exam_essay_reviews\(\)/);
  assert.match(migration, /public\.teacher_online_exam_results\(\)/);
  assert.match(migration, /public\.student_online_exam_results\(\)/);
  assert.match(migration, /count\(distinct link\.student_id\)::integer/);
  assert.match(migration, /public\.review_online_exam_essays\(uuid, numeric\)/);
  assert.match(migration, /p_essay_score not between 0 and 100/);
  assert.match(migration, /has_essay := v_essay_total > 0/);
  assert.match(migration, /grade_pending then null else attempt\.score end/);
  assert.match(migration, /exam\.ends_at <= now\(\)/);
  assert.doesNotMatch(migration, /'score', v_final_score/);
});

test('uses server-side deadlines, one attempt per student, safe response data, and idempotent submission', () => {
  assert.match(migration, /unique \(exam_id, student_id\)/);
  assert.match(migration, /least\(now\(\) \+ make_interval\(mins => selected_exam\.duration_minutes\), selected_exam\.ends_at\)/);
  assert.match(migration, /'deadline', selected_attempt\.deadline/);
  assert.match(migration, /if now\(\) >= selected_attempt\.deadline then/);
  assert.match(migration, /char_length\(answer\.value #>> '\{\}'\) > 1000/);
  assert.match(migration, /if selected_attempt\.submission_id <> p_submission_id then/);
  assert.match(migration, /submission_id = p_submission_id/);
  assert.match(migration, /jsonb_each\(p_answers\)/);
});

test('keeps a pending idempotent submission retryable after the client deadline', () => {
  assert.match(studentPage, /disabled=\{busy \|\| \(expired && !active\.submissionId\)\}/);
  assert.match(studentPage, /retry jika pengumpulan sebelumnya sudah diterima/);
  assert.match(studentPage, /\{expired && !active\.submissionId && \(/);
});

test('exposes an admin-only tenant exam overview without student answers or identities', () => {
  assert.match(schoolAdminOverviewMigration, /create or replace function public\.school_admin_online_exam_overview\(\)/);
  assert.match(schoolAdminOverviewMigration, /public\.current_app_role\(\)\) <> 'admin_sekolah'/);
  assert.match(schoolAdminOverviewMigration, /exam\.tenant_id = \(select public\.current_tenant_id\(\)\)/);
  assert.match(schoolAdminOverviewMigration, /tenant\.active = true/);
  assert.match(schoolAdminOverviewMigration, /count\(distinct link\.student_id\)::integer/);
  assert.match(schoolAdminOverviewMigration, /attempt\.grade_pending/);
  assert.match(schoolAdminOverviewMigration, /revoke all on function public\.school_admin_online_exam_overview\(\)[\s\S]*?from public, anon/);
  assert.doesNotMatch(schoolAdminOverviewMigration, /student\.nama|student\.nisn|attempt\.answers|correct_answer|essay_responses/);
});
