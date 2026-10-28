import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../../supabase/migrations/20261025001600_school_activity_and_chat_overview.sql', import.meta.url),
  'utf8',
);

test('recent activity is admin-only, tenant-scoped, bounded, and contains no user-generated content', () => {
  const start = migration.indexOf('create or replace function public.school_admin_recent_activity()');
  const end = migration.indexOf('create or replace function public.school_admin_chat_overview()', start);
  assert.notEqual(start, -1);
  const sql = migration.slice(start, end);
  assert.match(sql, /security definer\s+set search_path = ''/);
  assert.match(sql, /current_app_role\(\)\) not in \('admin', 'admin_sekolah'\)/);
  assert.match(sql, /tenant\.id = \(select public\.current_tenant_id\(\)\)/);
  assert.match(sql, /limit 100/);
  assert.match(sql, /interval '30 days'/);
  assert.match(sql, /student_guardian_link_audit/);
  assert.doesNotMatch(sql, /announcement\.title|announcement\.body|student\.nama|actor_id|resource_id/);
  assert.match(sql, /revoke all on function public\.school_admin_recent_activity\(\)\s+from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.school_admin_recent_activity\(\)\s+to authenticated/);
});

test('chat monitoring returns tenant aggregates only and never exposes message data', () => {
  const start = migration.indexOf('create or replace function public.school_admin_chat_overview()');
  assert.notEqual(start, -1);
  const sql = migration.slice(start);
  assert.match(sql, /current_app_role\(\)\) not in \('admin', 'admin_sekolah'\)/);
  assert.match(sql, /conversation\.participant_ids/);
  assert.match(sql, /profile\.tenant_id is distinct from active_tenant_id/);
  assert.match(sql, /message\.created_at >= now\(\) - interval '7 days'/);
  assert.match(sql, /message\.created_at >= now\(\) - interval '30 days'/);
  assert.match(sql, /message\.sender_id = any\(conversation\.participant_ids\)/);
  assert.match(sql, /sender\.tenant_id = active_tenant_id\s+and sender\.active = true/);
  assert.match(sql, /count\(distinct message\.sender_id\)/);
  assert.doesNotMatch(sql, /message\.body|message\.file_name|participant_names|profile\.nama/);
  assert.match(sql, /revoke all on function public\.school_admin_chat_overview\(\)\s+from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.school_admin_chat_overview\(\)\s+to authenticated/);
});
