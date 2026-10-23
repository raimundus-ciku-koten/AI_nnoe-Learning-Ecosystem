import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL(
  '../../supabase/migrations/20261023000700_teacher_daily_journals.sql',
  import.meta.url,
), 'utf8');

test('stores bounded daily journal fields without requiring student identifiers', () => {
  assert.match(migration, /create table if not exists public\.school_teacher_journals/);
  assert.match(migration, /lesson_date date not null default current_date/);
  assert.match(migration, /class_name text not null check/);
  assert.match(migration, /learning_objective text not null check/);
  assert.match(migration, /activities text not null check/);
  assert.match(migration, /status text not null default 'draf' check \(status in \('draf', 'selesai'\)\)/);
  assert.doesNotMatch(migration, /student_name|student_id|nisn|barcode/i);
});

test('keeps journal contents private to active teachers in their own tenant and roster', () => {
  assert.match(migration, /alter table public\.school_teacher_journals enable row level security/);
  assert.match(migration, /revoke all on table public\.school_teacher_journals from public, anon, authenticated/);
  assert.match(migration, /author_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /tenant_id = \(select public\.current_tenant_id\(\)\)/);
  assert.match(migration, /public\.current_user_is_active\(\)/);
  assert.match(migration, /tenant\.active = true/);
  assert.match(migration, /student\.owner_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /student\.kelas = school_teacher_journals\.class_name/);
  assert.doesNotMatch(migration, /'admin_sekolah'|'operator'|'superadmin'/);
});
