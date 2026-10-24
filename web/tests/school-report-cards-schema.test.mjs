import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../../supabase/migrations/20261025000900_school_report_cards.sql', import.meta.url),
  'utf8',
);

test('school report cards enforce configured periods, valid scores, and draft/publication state', () => {
  assert.match(migration, /create table if not exists public\.learning_classroom_report_cards/);
  assert.match(migration, /foreign key \(classroom_id, tenant_id\)/);
  assert.match(migration, /score numeric\(5, 2\) not null check \(score between 0 and 100\)/);
  assert.match(migration, /semester text not null check \(semester in \('ganjil', 'genap'\)\)/);
  assert.match(migration, /status text not null default 'draft' check \(status in \('draft', 'published'\)\)/);
  assert.match(migration, /learning_classroom_report_card_audit/);
});

test('students can only read published reports for their own assigned classroom', () => {
  assert.match(migration, /alter table public\.learning_classroom_report_cards enable row level security/);
  assert.match(migration, /student_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /status = 'published'/);
  assert.match(migration, /member\.member_role = 'siswa'/);
  assert.match(migration, /tenant_id = \(select public\.current_tenant_id\(\)\)/);
});

test('teacher drafts and admin publication use role-checked functions with an audit trail', () => {
  assert.match(migration, /create or replace function public\.save_learning_classroom_report_card_draft/);
  assert.match(migration, /actor_role not in \('guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'\)/);
  assert.match(migration, /classroom\.academic_year = school_year/);
  assert.match(migration, /create or replace function public\.publish_learning_classroom_report_card/);
  assert.match(migration, /public\.current_app_role\(\) <> 'admin_sekolah'/);
  assert.match(migration, /create or replace function public\.reopen_learning_classroom_report_card/);
  assert.match(migration, /'draft_saved', 'published', 'reopened'/);
  assert.match(migration, /grant execute on function public\.publish_learning_classroom_report_card\(uuid\)\s+to authenticated/);
  assert.doesNotMatch(
    migration,
    /grant (?:insert|update|delete|all) on table public\.learning_classroom_report_cards\s+to authenticated/i,
  );
});
