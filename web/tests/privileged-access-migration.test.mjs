import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const migration = await readFile(
  new URL('../../supabase/migrations/20261022000100_privileged_profile_active_aal2.sql', import.meta.url),
  'utf8',
);

test('privileged database access requires an active allowed profile and AAL2', () => {
  assert.match(migration, /create or replace function public\.current_user_is_active\(\)/);
  assert.match(migration, /security definer[\s\S]*?set search_path = ''/);
  assert.match(migration, /profile\.active[\s\S]*?profile\.role <> 'demo'/);
  assert.match(migration, /public\.current_app_role\(\) in \([\s\S]*?'superadmin', 'admin_sekolah'/);
  assert.match(migration, /auth\.jwt\(\) ->> 'aal' = 'aal2'/);
  assert.match(migration, /where profile\.id = auth\.uid\(\)/);
  assert.match(migration, /revoke all on function public\.current_user_is_active\(\) from public, anon/);
  assert.match(migration, /grant execute on function public\.current_user_is_active\(\) to authenticated/);
});
