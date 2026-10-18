import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL(
  '../../supabase/migrations/20261017001100_chat_messages.sql',
  import.meta.url,
);
const migration = await readFile(migrationPath, 'utf8');

test('defines text and Drive-pointer message fields with strict payload limits', () => {
  assert.match(migration, /create table if not exists public\.chat_messages/);
  assert.match(migration, /conversation_id uuid not null\s+references public\.chat_conversations\(id\)/);
  assert.match(migration, /sender_id uuid not null references auth\.users\(id\)/);
  assert.match(migration, /type text not null check \(type in \('text', 'image', 'file'\)\)/);
  assert.match(migration, /body text/);
  assert.match(migration, /drive_file_index_id uuid\s+references public\.drive_file_index\(id\)/);
  assert.match(migration, /file_size between 1 and 2097152/);
  assert.match(migration, /char_length\(body\) between 1 and 2000/);
  assert.match(migration, /created_at timestamptz not null default now\(\)/);
  assert.doesNotMatch(migration, /file_path|firebase|source_id/i);
});

test('uses participant RLS, sender-only immutable inserts, and verifies shared E2E Drive files', () => {
  assert.match(migration, /alter table public\.chat_messages enable row level security/);
  assert.match(migration, /current_user_is_active\(\)/);
  assert.match(migration, /sender_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /conversation\.participant_ids @> array\[\(select auth\.uid\(\)\)\]/);
  assert.match(migration, /private\.chat_drive_attachment_is_shareable/);
  assert.match(migration, /drive_file\.owner_id = p_sender_id/);
  assert.match(migration, /drive_file\.category = 'communication'/);
  assert.match(migration, /drive_file\.ciphertext_size_bytes >= p_source_file_size/);
  assert.match(migration, /envelope\.recipient_key_fingerprint <> encryption_key\.fingerprint/);
  assert.match(migration, /drive_access\.revoked_at is null/);
  assert.doesNotMatch(migration, /for update\s+to authenticated|for delete\s+to authenticated/i);
});

test('limits client columns and grants no update or delete privileges', () => {
  assert.match(migration, /revoke all on table public\.chat_messages from public, anon, authenticated/);
  assert.match(migration, /grant insert \([\s\S]*drive_file_index_id[\s\S]*file_size/);
  assert.doesNotMatch(migration, /grant update .*chat_messages/i);
  assert.doesNotMatch(migration, /grant delete .*chat_messages/i);
});
