import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL(
  '../../supabase/migrations/20261017000600_attendance_records.sql',
  import.meta.url,
);
const migration = await readFile(migrationPath, 'utf8');
const cleanupMigration = await readFile(new URL(
  '../../supabase/migrations/20261023000100_remove_billing_signup_demo.sql',
  import.meta.url,
), 'utf8');
const cleanupPolicies = cleanupMigration.slice(
  cleanupMigration.indexOf('create policy'),
  cleanupMigration.indexOf('create or replace function'),
);
const reportMigration = await readFile(new URL(
  '../../supabase/migrations/20261023000600_attendance_staff_report.sql',
  import.meta.url,
), 'utf8');

test('defines immutable per-student-per-day scan records with snapshot fields', () => {
  assert.match(migration, /create table if not exists public\.attendance_records/);
  assert.match(migration, /student_id uuid references public\.students\(id\) on delete set null/);
  assert.match(migration, /status text not null check \(status = 'hadir'\)/);
  assert.match(migration, /metode text not null check \(metode = 'scan'\)/);
  assert.match(migration, /attendance_records_student_day_unique/);
  assert.match(migration, /attendance_records_owner_date_idx/);
  assert.match(migration, /waktu timestamptz not null default now\(\)/);
});

test('keeps attendance writes scoped without subscription or demo-role gates', () => {
  assert.match(cleanupMigration, /drop policy if exists "Entitled teachers record matching student attendance"/);
  assert.match(cleanupMigration, /create policy "Active teachers record matching student attendance"/);
  assert.match(cleanupMigration, /owner_id = \(select auth\.uid\(\)\)/);
  assert.match(cleanupMigration, /tenant_id = \(select public\.current_tenant_id\(\)\)/);
  assert.match(cleanupMigration, /public\.current_user_is_active\(\)/);
  assert.match(cleanupMigration, /tenant\.active = true/);
  assert.doesNotMatch(cleanupPolicies, /tenant_entitlements|personal_entitlements|billing_plans|demo/i);
  assert.match(migration, /student\.kode_unik = attendance_records\.kode_unik/);
  assert.match(migration, /student\.nama = attendance_records\.nama/);
  assert.match(migration, /student\.kelas = attendance_records\.kelas/);
});

test('does not grant attendance update/delete to authenticated users or expose records anonymously', () => {
  assert.match(migration, /revoke all on table public\.attendance_records from anon, authenticated/);
  assert.doesNotMatch(migration, /grant (?:update|delete) .*public\.attendance_records/);
  assert.doesNotMatch(migration, /for (?:update|delete)\s+to authenticated/i);
});

test('serves filtered staff attendance through an active tenant and roster-checked RPC', () => {
  assert.match(reportMigration, /create or replace function public\.school_attendance_report/);
  assert.match(reportMigration, /security definer\s+set search_path = ''/);
  assert.match(reportMigration, /profile\.active = true/);
  assert.match(reportMigration, /profile\.role = actor_role/);
  assert.match(reportMigration, /profile\.tenant_id = active_tenant_id/);
  assert.match(reportMigration, /tenant\.active = true/);
  assert.match(reportMigration, /actor_role in \('admin_sekolah', 'operator'\)/);
  assert.match(reportMigration, /student\.owner_id = auth\.uid\(\)/);
  assert.match(reportMigration, /p_attendance_date/);
  assert.match(reportMigration, /p_class_name/);
  assert.match(reportMigration, /p_student_search/);
  assert.match(reportMigration, /limit p_limit\s+offset p_offset/);
  assert.match(reportMigration, /revoke all on function public\.school_attendance_report[\s\S]*from public, anon/);
  assert.doesNotMatch(reportMigration, /tenant_entitlements|service_role key/i);
});
