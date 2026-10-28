import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const migration = await readFile(
  new URL('../../supabase/migrations/20261028000100_platform_tenant_and_superadmin_provisioning.sql', import.meta.url),
  'utf8',
);

test('tenant creation is audited and restricted to active superadmins', () => {
  assert.match(migration, /create or replace function public\.create_platform_tenant/);
  assert.match(migration, /public\.current_user_is_active\(\)/);
  assert.match(migration, /public\.current_app_role\(\) <> 'superadmin'/);
  assert.match(migration, /insert into public\.tenants/);
  assert.match(migration, /'platform\.tenant\.created'/);
  assert.match(migration, /revoke all on function public\.create_platform_tenant\(text\) from public, anon/);
});

test('Super Admin provisioning requires a recent TOTP AAL2 check and audit trail', () => {
  assert.match(migration, /create or replace function public\.provision_platform_superadmin/);
  assert.match(migration, /auth\.jwt\(\) ->> 'aal' <> 'aal2'/);
  assert.match(migration, /factor ->> 'method' = 'totp'/);
  assert.match(migration, /extract\(epoch from now\(\)\)::bigint - 600/);
  assert.match(migration, /normalized_email = actor_email/);
  assert.match(migration, /'platform\.superadmin\.provisioned'/);
  assert.match(migration, /revoke all on function public\.provision_platform_superadmin\(text, text\)\s+from public, anon/);
  assert.match(migration, /assigned_roles|array\['superadmin'\]::text\[\]/);
});
