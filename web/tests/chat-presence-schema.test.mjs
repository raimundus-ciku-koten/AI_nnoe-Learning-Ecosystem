import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL(
  '../../supabase/migrations/20261017001500_chat_presence.sql',
  import.meta.url,
);
const migration = await readFile(migrationPath, 'utf8');

test('stores only durable last-seen data and keys it by the Supabase user', () => {
  assert.match(migration, /create table if not exists public\.chat_presence/);
  assert.match(migration, /user_id uuid primary key references auth\.users\(id\)/);
  assert.match(migration, /last_seen_at timestamptz not null/);
  assert.doesNotMatch(migration, /online boolean|legacy_uid|firebase/i);
});

test('enables active-user reads and self-only timestamp writes under RLS', () => {
  assert.match(migration, /alter table public\.chat_presence enable row level security/);
  assert.match(migration, /current_user_is_active\(\)/);
  assert.match(migration, /user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /last_seen_at <= now\(\)/);
  assert.match(migration, /for select[\s\S]*for insert[\s\S]*for update[\s\S]*for delete/);
});

test('prevents clients from changing the identity key', () => {
  assert.match(migration, /grant insert \(user_id, last_seen_at\)/);
  assert.match(migration, /grant update \(last_seen_at\)/);
  assert.doesNotMatch(migration, /grant update \([^)]*user_id/);
});
