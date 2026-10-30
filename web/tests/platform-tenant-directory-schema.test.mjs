import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const migration = readFileSync(
  new URL('../../supabase/migrations/20261030001100_platform_tenant_directory.sql', import.meta.url),
  'utf8',
);

describe('platform tenant directory RPC migration', () => {
  it('is active-superadmin-only and uses bounded keyset pagination', () => {
    assert.match(migration, /public\.platform_tenant_directory_page\s*\(/i);
    assert.match(migration, /public\.current_user_is_active\(\)/i);
    assert.match(migration, /public\.current_app_role\(\)\)\s*<>\s*'superadmin'/i);
    assert.match(migration, /p_limit\s*<\s*1\s+or\s+p_limit\s*>\s*100/i);
    assert.match(migration, /tenant\.id\s*>\s*p_after/i);
    assert.match(migration, /limit\s+p_limit/i);
    assert.match(migration, /revoke all on function[\s\S]*from public, anon/i);
  });

  it('returns tenant-level counts and latest school billing state without owner or provider identifiers', () => {
    for (const column of [
      'tenant_id', 'tenant_name', 'tenant_active', 'profile_count',
      'active_profile_count', 'student_count', 'latest_plan_name',
      'latest_order_status', 'latest_order_created_at', 'latest_order_total',
    ]) {
      assert.match(migration, new RegExp(`\\b${column}\\b`, 'i'));
    }
    assert.match(migration, /purchase\.product_type\s*=\s*'school'/i);
    assert.doesNotMatch(migration, /owner_email|owner_id|midtrans_transaction_id|redirect_url/i);
  });
});
