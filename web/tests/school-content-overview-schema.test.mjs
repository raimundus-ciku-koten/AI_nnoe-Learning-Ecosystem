import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../../supabase/migrations/20261025001800_school_content_overview.sql', import.meta.url),
  'utf8',
);

test('content overview is active-tenant admin-only and exposes only aggregate counts', () => {
  assert.match(migration, /security definer\s+set search_path = ''/);
  assert.match(migration, /current_app_role\(\)\) not in \('admin', 'admin_sekolah'\)/);
  assert.match(migration, /tenant\.id = active_tenant_id\s+and tenant\.active = true/);
  assert.match(migration, /material\.tenant_id = active_tenant_id/);
  assert.match(migration, /announcement\.tenant_id = active_tenant_id/);
  assert.equal((migration.match(/^\s*select '[a-z0-9_]+'::text, count\(\*\)::bigint$/gm) || []).length, 3);
  assert.match(migration, /interval '30 days'/);
  assert.match(migration, /revoke all on function public\.school_admin_content_overview\(\)\s+from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.school_admin_content_overview\(\)\s+to authenticated/);
  assert.doesNotMatch(migration, /material\.title|material\.content|announcement\.body|student_id/);
});
