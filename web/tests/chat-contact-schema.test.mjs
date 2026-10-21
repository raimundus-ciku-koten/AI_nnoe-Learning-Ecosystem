import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL(
  '../../supabase/migrations/20261017001400_chat_contacts.sql',
  import.meta.url,
);
const migration = await readFile(migrationPath, 'utf8');

test('defines authoritative directional contacts with canonical-pair uniqueness', () => {
  assert.match(migration, /create table if not exists public\.chat_contacts/);
  assert.match(migration, /from_user_id uuid not null references auth\.users\(id\)/);
  assert.match(migration, /to_user_id uuid not null references auth\.users\(id\)/);
  assert.match(migration, /status text not null check \(status in \('pending', 'accepted'\)\)/);
  assert.match(migration, /participant_names jsonb not null/);
  assert.match(migration, /created_at timestamptz not null default now\(\)/);
  assert.match(migration, /updated_at timestamptz/);
  assert.match(migration, /least\(from_user_id, to_user_id\)/);
  assert.match(migration, /greatest\(from_user_id, to_user_id\)/);
  assert.doesNotMatch(migration, /pair_id|legacy_uid|firebase/i);
});

test('enforces sender-created pending requests and recipient-only acceptance with RLS', () => {
  assert.match(migration, /alter table public\.chat_contacts enable row level security/);
  assert.match(migration, /private\.chat_contact_request_is_valid/);
  assert.match(migration, /status = 'pending'/);
  assert.match(migration, /to_user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /status = 'accepted'/);
  assert.match(migration, /sender\.tenant_id = recipient\.tenant_id/);
  assert.match(migration, /sender\.role = 'superadmin'/);
  assert.match(migration, /Contact participants delete their relation/);
});

test('gates direct chat creation and messages on accepted contacts', () => {
  assert.match(migration, /drop policy if exists "Active users create conversations"/);
  assert.match(migration, /contact\.status = 'accepted'/);
  assert.match(migration, /drop policy if exists "Participants create immutable messages"/);
  assert.match(migration, /conversation\.type = 'group'/);
});
