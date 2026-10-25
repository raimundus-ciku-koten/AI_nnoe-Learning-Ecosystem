import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL(
  '../../supabase/migrations/20261026000300_teacher_rubric_workflows.sql',
  import.meta.url,
), 'utf8');
const page = await readFile(new URL('../src/pages/ClassroomRubricsPage.jsx', import.meta.url), 'utf8');
const service = await readFile(new URL('../src/services/classroomRubrics.js', import.meta.url), 'utf8');
const ciWorkflow = await readFile(new URL(
  '../../.github/workflows/web-ci.yml',
  import.meta.url,
), 'utf8');

test('stores tenant- and classroom-scoped rubrics with immutable validated versions', () => {
  assert.match(migration, /create table if not exists public\.classroom_rubrics/);
  assert.match(migration, /create table if not exists public\.classroom_rubric_versions/);
  assert.match(migration, /foreign key \(classroom_id, tenant_id\)/);
  assert.match(migration, /unique \(rubric_id, version\)/);
  assert.match(migration, /classroom_rubric_criteria_valid\(criteria\)/);
  assert.match(migration, /jsonb_array_length\(p_criteria\) not between 1 and 12/);
  assert.match(migration, /char_length\(btrim\(item\.value -> 'levels' ->> level\.key\)\)\s+not between 1 and 500/);
  assert.match(migration, /revoke all on table public\.classroom_rubrics, public\.classroom_rubric_versions\s+from public, anon, authenticated/);
  assert.match(migration, /create policy "Assigned teachers read classroom rubrics"/);
  assert.match(migration, /create policy "Assigned teachers read classroom rubric versions"/);
  assert.match(migration, /public\.current_user_is_assigned_class_teacher/);
  assert.match(migration, /owner_id = auth\.uid\(\)/);
  assert.match(migration, /create or replace function public\.create_classroom_rubric_version/);
  assert.doesNotMatch(migration, /grant\s+(insert|update|delete|all)\s+on\s+table\s+public\.classroom_rubrics,\s+public\.classroom_rubric_versions\s+to authenticated/i);
});

test('keeps rubric authoring teacher-only and does not assign student scores', () => {
  assert.match(page, /isTeacherRole\(currentRole\)/);
  assert.match(page, /Rubrik ini adalah instrumen kerja guru/);
  assert.match(page, /belum memberi skor siswa/);
  assert.match(page, /Riwayat versi/);
  assert.match(service, /create_classroom_rubric/);
  assert.match(service, /create_classroom_rubric_version/);
  assert.match(service, /\.limit\(20, \{ referencedTable: 'classroom_rubric_versions' \}\)/);
});

test('runs the complete migration chain against a pinned disposable Supabase database in CI', () => {
  assert.match(ciWorkflow, /supabase\/postgres:17\.11\.0\.007@sha256:[a-f0-9]{64}/);
  assert.match(ciWorkflow, /Prepare Supabase auth helpers on disposable database/);
  assert.match(ciWorkflow, /Replay migrations and audit schema on disposable database/);
  assert.match(ciWorkflow, /run: node scripts\/validateMigrationChain\.mjs/);
  assert.match(ciWorkflow, /PGHOST: 127\.0\.0\.1/);
  assert.match(ciWorkflow, /PGSSLMODE: disable/);
});
