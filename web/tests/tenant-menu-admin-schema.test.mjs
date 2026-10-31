import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const migration = readFileSync(
  new URL('../../supabase/migrations/20261030001200_tenant_and_user_menu_admin.sql', import.meta.url),
  'utf8',
);

describe('tenant and per-user menu admin migration', () => {
  it('creates tenants only through an active-superadmin RPC with audit logging', () => {
    assert.match(migration, /create or replace function public\.create_platform_tenant/i);
    assert.match(migration, /public\.current_user_is_active\(\)/i);
    assert.match(migration, /public\.current_app_role\(\)\)\s*<>\s*'superadmin'/i);
    assert.match(migration, /normalized_id !~ '\^\[a-z0-9\]/i);
    assert.match(migration, /'platform\.tenant\.created'/i);
    assert.match(migration, /revoke all on function public\.create_platform_tenant/i);
  });

  it('provides self-read and superadmin write paths for menu overrides with audit records', () => {
    assert.match(migration, /create table if not exists public\.platform_user_menu_overrides/i);
    assert.match(migration, /create or replace function public\.current_user_disabled_menu_keys/i);
    assert.match(migration, /override\.user_id = auth\.uid\(\)/i);
    assert.match(migration, /create or replace function public\.platform_user_menu_overrides/i);
    assert.match(migration, /create or replace function public\.set_platform_user_disabled_menus/i);
    assert.match(migration, /cardinality\(p_disabled_menu_keys\)\s*>\s*200/i);
    assert.match(migration, /'platform\.user\.menus\.updated'/i);
    assert.ok(migration.includes("value ~ '\\|/dashboard(\\?|$)'"));
    assert.match(migration, /revoke all on table public\.platform_user_menu_overrides from public, anon, authenticated/i);
  });

  it('keeps menu visibility separate from tenant data access', () => {
    assert.match(migration, /grant execute on function public\.set_platform_user_disabled_menus/i);
    assert.doesNotMatch(migration, /grant\s+(insert|update|delete|all)\s+on\s+public\.profiles/i);
    assert.doesNotMatch(migration, /create policy[\s\S]*platform_user_menu_overrides/i);
  });
});
