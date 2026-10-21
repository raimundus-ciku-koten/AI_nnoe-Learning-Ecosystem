import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL(
  '../../supabase/migrations/20261017001000_chat_conversations.sql',
  import.meta.url,
);
const migration = await readFile(migrationPath, 'utf8');

test('defines bounded conversation metadata without source identifiers', () => {
  assert.match(migration, /create table if not exists public\.chat_conversations/);
  assert.match(migration, /id uuid primary key default gen_random_uuid\(\)/);
  assert.match(migration, /type text not null check \(type in \('direct', 'group'\)\)/);
  assert.match(migration, /title text check/);
  assert.match(migration, /participant_ids uuid\[\] not null/);
  assert.match(migration, /participant_names jsonb not null/);
  assert.match(migration, /created_by uuid not null references auth\.users\(id\)/);
  assert.match(migration, /created_at timestamptz not null default now\(\)/);
  assert.match(migration, /cardinality\(p_participant_ids\) between 2 and 50/);
  assert.match(migration, /check \(type <> 'direct' or cardinality\(participant_ids\) = 2\)/);
  assert.match(migration, /using gin \(participant_ids\)/);
  assert.doesNotMatch(migration, /legacy_uid|firebase|source_id/i);
});

test('enables participant-only RLS and validates active participants on writes', () => {
  assert.match(migration, /alter table public\.chat_conversations enable row level security/);
  assert.match(migration, /private\.chat_participants_are_valid\(participant_ids, created_by\)/);
  assert.match(migration, /participant_ids @> array\[\(select auth\.uid\(\)\)\]/);
  assert.match(migration, /current_user_is_active\(\)/);
  assert.match(migration, /creator\.active = true/);
  assert.match(migration, /profile\.active is not true/);
  assert.match(migration, /creator\.role = 'superadmin'/);
  assert.match(migration, /profile\.tenant_id is distinct from/);
});

test('limits grants, prevents client reassignment of creator/time, and forbids deletes', () => {
  assert.match(migration, /revoke all on table public\.chat_conversations from public, anon, authenticated/);
  assert.match(migration, /grant insert \(type, title, participant_ids, participant_names, created_by\)/);
  assert.match(migration, /grant update \(type, title, participant_ids, participant_names\)/);
  assert.doesNotMatch(migration, /for delete\s+to authenticated/i);
  assert.doesNotMatch(migration, /grant (insert|update) \([^)]*created_at/i);
  assert.doesNotMatch(migration, /grant update \([^)]*created_by/i);
});
