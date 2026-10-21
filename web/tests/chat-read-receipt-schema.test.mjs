import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL(
  '../../supabase/migrations/20261017001200_chat_read_receipts.sql',
  import.meta.url,
);
const migration = await readFile(migrationPath, 'utf8');

test('defines a conversation/user composite key and UTC read cursor field', () => {
  assert.match(migration, /create table if not exists public\.chat_read_receipts/);
  assert.match(migration, /conversation_id uuid not null\s+references public\.chat_conversations\(id\)/);
  assert.match(migration, /user_id uuid not null references auth\.users\(id\)/);
  assert.match(migration, /last_read_at timestamptz not null/);
  assert.match(migration, /primary key \(conversation_id, user_id\)/);
  assert.doesNotMatch(migration, /legacy_uid|firebase|source_id/i);
});

test('enforces participant reads and self-only insert, update and delete under RLS', () => {
  assert.match(migration, /alter table public\.chat_read_receipts enable row level security/);
  assert.match(migration, /user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /conversation\.participant_ids @> array\[\(select auth\.uid\(\)\)\]/);
  assert.match(migration, /last_read_at <= now\(\)/);
  assert.match(migration, /for select[\s\S]*for insert[\s\S]*for update[\s\S]*for delete/);
});

test('restricts writes to receipt time and never allows participant identity reassignment', () => {
  assert.match(migration, /revoke all on table public\.chat_read_receipts from public, anon, authenticated/);
  assert.match(migration, /grant insert \(conversation_id, user_id, last_read_at\)/);
  assert.match(migration, /grant update \(last_read_at\)/);
  assert.doesNotMatch(migration, /grant update \([^)]*conversation_id|grant update \([^)]*user_id/);
});
