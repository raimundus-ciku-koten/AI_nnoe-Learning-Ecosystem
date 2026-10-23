import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL(
  '../../supabase/migrations/20261023000200_guardian_student_portal.sql',
  import.meta.url,
), 'utf8');

test('keeps guardian links private and limits mutations to active same-tenant admins', () => {
  assert.match(migration, /create table if not exists public\.guardian_student_links/);
  assert.match(migration, /create table if not exists public\.guardian_student_link_audit/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.guardian_student_links, public\.guardian_student_link_audit\s+from public, anon, authenticated/);
  assert.match(migration, /public\.current_user_is_active\(\)[\s\S]*?public\.current_app_role\(\)\) <> 'admin_sekolah'/);
  assert.match(migration, /student\.tenant_id = \(select public\.current_tenant_id\(\)\)/);
  assert.match(migration, /profile\.tenant_id = selected_tenant/);
  assert.match(migration, /profile\.role in \('ortu', 'orang_tua'\)/);
  assert.match(migration, /p_relationship_verified is distinct from true/);
  assert.match(migration, /relationship_verified\s+boolean not null default false/);
  assert.match(migration, /'linked', true/);
  assert.match(migration, /'unlinked'/);
});

test('returns only linked children to active parent roles and minimizes academic data', () => {
  assert.match(migration, /create or replace function public\.parent_children_overview\(\)/);
  assert.match(migration, /public\.current_app_role\(\)\) not in \('ortu', 'orang_tua'\)/);
  assert.match(migration, /link\.guardian_user_id = auth\.uid\(\)/);
  assert.match(migration, /link\.tenant_id = \(select public\.current_tenant_id\(\)\)/);
  assert.match(migration, /guardian\.tenant_id = link\.tenant_id/);
  assert.match(migration, /guardian\.role in \('ortu', 'orang_tua'\)/);
  assert.match(migration, /attendance\.status = 'hadir'/);
  assert.match(migration, /attempt\.grade_pending = false/);
  assert.match(migration, /revoke all on function public\.parent_children_overview\(\) from public, anon/);
  assert.match(migration, /grant execute on function public\.parent_children_overview\(\) to authenticated/);
  assert.doesNotMatch(migration, /grant select on table public\.guardian_student_links/);
});
