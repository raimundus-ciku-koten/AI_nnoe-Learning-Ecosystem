import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL(
  '../../supabase/migrations/20261018000200_chat_runtime.sql',
  import.meta.url,
);
const migration = await readFile(migrationPath, 'utf8');

test('exposes only safe directory fields to active same-tenant chat users', () => {
  assert.match(migration, /create or replace function public\.list_chat_directory\(\)/);
  assert.match(migration, /returns table \([\s\S]*uid uuid,[\s\S]*nama text,[\s\S]*role text,[\s\S]*photo_url text/);
  assert.match(migration, /security definer\s+set search_path = ''/);
  assert.match(migration, /current_user_is_active\(\)/);
  assert.match(migration, /\(select public\.current_app_role\(\)\) = 'superadmin'/);
  assert.match(migration, /profile\.tenant_id = \(select public\.current_tenant_id\(\)\)/);
  assert.match(migration, /profile\.role not in \('unprovisioned', 'demo'\)/);
  assert.match(migration, /grant execute on function public\.list_chat_directory\(\) to authenticated/);
  assert.doesNotMatch(migration, /profile\.email|legacy_uid|auth_secret/i);
});

test('enables realtime for chat tables and explicit online presence state', () => {
  assert.match(migration, /add column if not exists online boolean not null default false/);
  assert.match(migration, /grant insert \(user_id, last_seen_at, online\)/);
  assert.match(migration, /grant update \(last_seen_at, online\)/);
  for (const table of [
    'chat_contacts',
    'chat_conversations',
    'chat_messages',
    'chat_read_receipts',
    'chat_presence',
  ]) {
    assert.match(migration, new RegExp(`'${table}'`));
  }
  assert.match(migration, /alter publication supabase_realtime add table public\.\%I/);
});
