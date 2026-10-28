import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../../supabase/migrations/20261025001900_school_admin_material_catalog.sql', import.meta.url),
  'utf8',
);

test('material catalog RPC is admin-only, active-tenant scoped, bounded, and omits content bodies', () => {
  assert.match(migration, /security definer\s+set search_path = ''/);
  assert.match(migration, /current_app_role\(\)\) not in \('admin', 'admin_sekolah'\)/);
  assert.match(migration, /tenant\.id = active_tenant_id\s+and tenant\.active = true/);
  assert.match(migration, /material\.tenant_id = active_tenant_id/);
  assert.match(migration, /classroom\.tenant_id = material\.tenant_id/);
  assert.match(migration, /order by material\.updated_at desc, material\.id desc\s+limit 50/);
  assert.doesNotMatch(migration, /material\.content|student_id|student_name/);
  assert.match(migration, /revoke all on function public\.school_admin_classroom_material_catalog\(\)\s+from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.school_admin_classroom_material_catalog\(\)\s+to authenticated/);
});
