import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(
  new URL('../../supabase/migrations/20261020000100_student_learning_space.sql', import.meta.url),
  'utf8',
);
const releaseAudit = await readFile(
  new URL('../../supabase/audit_staging_release_gate.sql', import.meta.url),
  'utf8',
);

test('stores teacher-owned schedules and student materials with bounded fields', () => {
  assert.match(migration, /create table if not exists public\.student_class_schedule/);
  assert.match(migration, /create table if not exists public\.student_learning_materials/);
  assert.match(migration, /day_of_week between 1 and 7/);
  assert.match(migration, /ends_at > starts_at/);
  assert.ok(migration.includes("resource_url ~ '^https://[^[:space:]]+$'"));
  assert.match(migration, /owner_id uuid not null references auth\.users\(id\) on delete cascade/);
  assert.match(migration, /updated_at timestamptz not null default now\(\)/);
});

test('uses teacher entitlement and owner policies while students read only linked class data', () => {
  assert.match(migration, /alter table public\.student_class_schedule enable row level security/);
  assert.match(migration, /alter table public\.student_learning_materials enable row level security/);
  assert.match(migration, /owner_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /public\.can_manage_student_learning\(\)/);
  assert.match(migration, /public\.can_publish_student_learning\(text, text\)/);
  assert.match(migration, /entitlement\.status in \('trial', 'active'\)/);
  assert.match(migration, /p_kelas = any\(profile\.kelas_ids\)/);
  assert.match(migration, /p_mapel = any\(profile\.mapel_ids\)/);
  assert.match(migration, /public\.student_learning_schedule\(\)/);
  assert.match(migration, /public\.student_learning_materials\(\)/);
  assert.match(migration, /link\.user_id = auth\.uid\(\)/);
  assert.match(migration, /schedule\.tenant_id = student\.tenant_id and schedule\.kelas = student\.kelas/);
  assert.match(migration, /material\.tenant_id = student\.tenant_id and material\.kelas = student\.kelas/);
  assert.match(migration, /schedule\.mapel = any\(teacher\.mapel_ids\)/);
  assert.match(migration, /material\.mapel = any\(teacher\.mapel_ids\)/);
  assert.match(migration, /revoke all on table public\.student_class_schedule, public\.student_learning_materials\s+from public, anon, authenticated/);
});

test('adds the new relations to the read-only staging release audit', () => {
  assert.match(releaseAudit, /'student_class_schedule'/);
  assert.match(releaseAudit, /'student_learning_materials'/);
  assert.match(releaseAudit, /^\s*begin read only;/i);
});
