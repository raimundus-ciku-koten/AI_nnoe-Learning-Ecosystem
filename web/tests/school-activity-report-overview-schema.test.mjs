import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../../supabase/migrations/20261025001700_school_activity_report_overview.sql', import.meta.url),
  'utf8',
);

test('school report metrics are fixed-label, admin-only and restricted to active tenant aggregates', () => {
  assert.match(migration, /security definer\s+set search_path = ''/);
  assert.match(migration, /current_app_role\(\)\) not in \('admin', 'admin_sekolah'\)/);
  assert.match(migration, /tenant\.id = active_tenant_id\s+and tenant\.active = true/);
  assert.match(migration, /classroom\.tenant_id = active_tenant_id/);
  assert.match(migration, /journal\.tenant_id = active_tenant_id/);
  assert.match(migration, /session\.tenant_id = active_tenant_id/);
  assert.match(migration, /assignment\.tenant_id = active_tenant_id/);
  assert.match(migration, /quiz\.tenant_id = active_tenant_id/);
  assert.equal((migration.match(/^\s*select '[a-z0-9_]+'::text, count\(\*\)::bigint$/gm) || []).length, 5);
  assert.match(migration, /interval '30 days'/);
  assert.match(migration, /revoke all on function public\.school_admin_activity_report_overview\(\)\s+from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.school_admin_activity_report_overview\(\)\s+to authenticated/);
  assert.doesNotMatch(migration, /student_id|student_name|student\.name|assignment\.instructions|journal\.reflection/);
});
