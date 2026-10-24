import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../../supabase/migrations/20261025001000_school_report_card_portfolios.sql', import.meta.url),
  'utf8',
);
const subjectMigration = await readFile(
  new URL('../../supabase/migrations/20261025000900_school_report_cards.sql', import.meta.url),
  'utf8',
);

test('report portfolios capture core report sections and all graduate profile dimensions', () => {
  assert.match(migration, /create table if not exists public\.learning_school_report_card_portfolios/);
  for (const column of [
    'attendance_present',
    'attendance_excused',
    'attendance_sick',
    'attendance_absent',
    'kokurikuler_summary',
    'student_nisn_snapshot',
    'student_gender_snapshot',
    'education_level_snapshot',
    'development_summary',
    'dimension_faith',
    'dimension_citizenship',
    'dimension_critical_reasoning',
    'dimension_creativity',
    'dimension_collaboration',
    'dimension_independence',
    'dimension_health',
    'dimension_communication',
    'extracurricular_summary',
    'achievements_summary',
    'homeroom_note',
  ]) {
    assert.match(migration, new RegExp(`\\b${column}\\b`));
  }
  assert.match(migration, /unique \(student_id, academic_year, semester\)/);
  assert.match(migration, /attendance_present smallint check \(attendance_present between 0 and 366\)/);
});

test('students can only read their own published portfolio and teacher writes require assigned class membership', () => {
  assert.match(migration, /alter table public\.learning_school_report_card_portfolios enable row level security/);
  assert.match(migration, /student_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /status = 'published'/);
  assert.match(migration, /teacher\.user_id = actor_id/);
  assert.match(migration, /learner\.user_id = p_student_id/);
  assert.match(migration, /link\.user_id = p_student_id/);
  assert.match(migration, /classroom\.academic_year = school_year/);
  assert.doesNotMatch(
    migration,
    /grant (?:insert|update|delete|all) on table public\.learning_school_report_card_portfolios\s+to authenticated/i,
  );
});

test('only school administrators publish or reopen, with an audit trail and subject-grade readiness', () => {
  assert.match(migration, /create or replace function public\.publish_learning_school_report_card_portfolio/);
  assert.match(migration, /create or replace function public\.reopen_learning_school_report_card_portfolio/);
  assert.match(migration, /public\.current_app_role\(\) <> 'admin_sekolah'/);
  assert.match(migration, /subject-reports-not-ready/);
  assert.match(migration, /classroom\.subject is not null/);
  assert.match(migration, /not exists \(\s+select 1\s+from public\.learning_classroom_report_cards as card/s);
  assert.match(migration, /report-period-not-active/);
  assert.match(migration, /learning_school_report_card_portfolio_audit/);
  assert.match(migration, /'draft_saved', 'published', 'reopened'/);
});

test('TK portfolios publish narrative development reports without requiring numeric subject grades', () => {
  assert.match(migration, /if school_level = 'tk' then\s+if btrim\(portfolio\.development_summary\) = '' then/s);
  assert.match(migration, /education_level_snapshot in \('', 'tk', 'sd', 'smp', 'sma'\)/);
  assert.match(migration, /p_development_summary text/);
  assert.match(subjectMigration, /numeric-report-not-available-for-tk/);
});
