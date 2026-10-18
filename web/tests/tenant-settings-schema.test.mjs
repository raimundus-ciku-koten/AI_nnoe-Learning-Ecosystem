import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const path = new URL(
  '../../supabase/migrations/20261018000300_tenant_settings_updates.sql',
  import.meta.url,
);
const migration = await readFile(path, 'utf8');

test('grants tenant setting updates only for the editable profile and cycle columns', () => {
  assert.match(migration, /grant update\s*\(\s*name,\s*education_level,\s*npsn,\s*headmaster_name,\s*headmaster_nip,\s*academic_year,\s*semester,\s*updated_by\s*\)/i);
  assert.doesNotMatch(migration, /grant update\s*\(\s*active/i);
  assert.doesNotMatch(migration, /grant update\s*\(\s*id/i);
});

test('restricts settings changes to active tenant admins and records the actor', () => {
  assert.match(migration, /for update\s+to authenticated/i);
  assert.match(migration, /public\.current_user_is_active\(\)/i);
  assert.match(migration, /public\.current_app_role\(\).*'superadmin'/is);
  assert.match(migration, /public\.current_app_role\(\).*'admin_sekolah'/is);
  assert.match(migration, /updated_by = \(select auth\.uid\(\)\)/i);
  assert.doesNotMatch(migration, /delete from public\.tenants|drop table|truncate/i);
});
