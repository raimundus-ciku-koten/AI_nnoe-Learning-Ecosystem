import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL(
  '../../supabase/migrations/20261023000400_school_task_submissions.sql',
  import.meta.url,
), 'utf8');

test('stores one bounded text submission per linked student and task without cascading task deletion', () => {
  assert.match(migration, /create table if not exists public\.school_task_submissions/);
  assert.match(migration, /task_id uuid not null references public\.school_learning_items\(id\) on delete restrict/);
  assert.match(migration, /student_id uuid not null references public\.students\(id\) on delete restrict/);
  assert.match(migration, /unique \(task_id, student_id\)/);
  assert.match(migration, /feedback text check/);
  assert.doesNotMatch(migration, /on delete cascade/i);
  assert.match(migration, /revoke all on table public\.school_task_submissions from public, anon, authenticated/);
});

test('submission RPC checks active student, published task, tenant, linked class, and due date', () => {
  const submit = migration.slice(
    migration.indexOf('create or replace function public.submit_school_task'),
    migration.indexOf('create or replace function public.student_school_task_submissions'),
  );
  assert.match(submit, /security definer\s+set search_path = ''/);
  assert.match(submit, /current_app_role\(\)\) <> 'siswa'/);
  assert.match(submit, /item\.kind = 'task'/);
  assert.match(submit, /item\.published = true/);
  assert.match(submit, /item\.due_at >= now\(\)/);
  assert.match(submit, /link\.user_id = auth\.uid\(\)/);
  assert.match(submit, /student\.kelas = selected_task\.class_name/);
  assert.match(submit, /translate\(answer_text, E'\\n\\r\\t', ''\)/);
  assert.match(submit, /on conflict \(task_id, student_id\)/);
  assert.match(submit, /reviewed_by = null/);
});

test('student history and staff review RPCs enforce the correct owner and tenant', () => {
  const studentHistory = migration.slice(
    migration.indexOf('create or replace function public.student_school_task_submissions'),
    migration.indexOf('create or replace function public.school_task_submissions'),
  );
  const staffList = migration.slice(
    migration.indexOf('create or replace function public.school_task_submissions'),
    migration.indexOf('create or replace function public.review_school_task_submission'),
  );
  const review = migration.slice(
    migration.indexOf('create or replace function public.review_school_task_submission'),
    migration.indexOf('revoke all on function public.submit_school_task'),
  );
  assert.match(studentHistory, /link\.user_id = auth\.uid\(\)/);
  assert.match(studentHistory, /tenant\.active = true/);
  assert.match(studentHistory, /limit 500/);
  assert.match(staffList, /item\.author_id = auth\.uid\(\)/);
  assert.match(staffList, /tenant\.active = true/);
  assert.match(staffList, /current_tenant_id\(\)/);
  assert.match(staffList, /limit 500/);
  assert.match(review, /item\.author_id = auth\.uid\(\)/);
  assert.match(review, /tenant\.active = true/);
  assert.match(review, /current_tenant_id\(\)/);
  assert.match(review, /reviewed_by = case when feedback_text is null then null else auth\.uid\(\) end/);
});
