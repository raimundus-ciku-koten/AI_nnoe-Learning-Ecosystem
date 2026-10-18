import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL(
  '../../supabase/migrations/20261017001300_chat_inbox_view.sql',
  import.meta.url,
);
const migration = await readFile(migrationPath, 'utf8');

test('defines an invoker-security inbox view derived from normalized chat tables', () => {
  assert.match(migration, /create or replace view public\.chat_inbox/);
  assert.match(migration, /security_invoker = true/);
  assert.match(migration, /from public\.chat_conversations as conversation/);
  assert.match(migration, /from public\.chat_messages as message/);
  assert.match(migration, /left join public\.chat_read_receipts as receipt/);
  assert.match(migration, /member\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /current_user_is_active\(\)/);
  assert.match(migration, /grant select on public\.chat_inbox to authenticated/);
  assert.doesNotMatch(migration, /firebase|userChats|legacy_uid/i);
});

test('derives preview, latest message and unread count without writable snapshots', () => {
  assert.match(migration, /as last_text/);
  assert.match(migration, /as last_message_at/);
  assert.match(migration, /as last_sender_id/);
  assert.match(migration, /as unread_count/);
  assert.match(migration, /unread_message\.sender_id <> member\.user_id/);
  assert.match(migration, /receipt\.last_read_at/);
  assert.match(migration, /order by message\.created_at desc, message\.id desc/);
  assert.doesNotMatch(migration, /insert into|update public\.chat_inbox|for insert|for update/i);
});
