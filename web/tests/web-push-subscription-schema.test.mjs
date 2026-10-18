import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL(
  '../../supabase/migrations/20261017001600_web_push_subscriptions.sql',
  import.meta.url,
);
const migration = await readFile(migrationPath, 'utf8');

test('defines Web Push data without Firebase token fields', () => {
  assert.match(migration, /create table if not exists public\.web_push_subscriptions/);
  assert.match(migration, /user_id uuid not null references auth\.users\(id\) on delete cascade/);
  assert.match(migration, /endpoint text not null/);
  assert.match(migration, /p256dh text not null/);
  assert.match(migration, /auth_secret text not null/);
  assert.match(migration, /unique \(user_id, endpoint\)/);
  assert.doesNotMatch(migration, /fcm|firebase|token_key/i);
});

test('protects subscriptions with owner-only RLS and length checks', () => {
  assert.match(migration, /enable row level security/);
  assert.match(migration, /user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /length\(endpoint\) between 1 and 4096/);
  assert.match(migration, /length\(p256dh\) between 1 and 512/);
  assert.match(migration, /length\(auth_secret\) between 1 and 512/);
  assert.match(migration, /web_push_subscriptions_set_updated_at/);
  assert.match(migration, /for select[\s\S]*for insert[\s\S]*for update[\s\S]*for delete/);
  assert.match(migration, /grant insert \(user_id, endpoint, p256dh, auth_secret\)/);
  assert.match(migration, /grant update \(endpoint, p256dh, auth_secret\)/);
  assert.doesNotMatch(migration, /grant select, insert, update, delete on public\.web_push_subscriptions to authenticated/);
});
