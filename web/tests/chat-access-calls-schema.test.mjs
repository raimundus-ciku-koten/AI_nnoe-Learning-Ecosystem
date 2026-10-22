import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL(
  '../../supabase/migrations/20261020000100_chat_access_and_calls.sql',
  import.meta.url,
);
const migration = await readFile(migrationPath, 'utf8');
const roomPath = new URL('../src/views/chat/chatRoom.js', import.meta.url);
const room = await readFile(roomPath, 'utf8');
const contactsPath = new URL('../src/views/chat/contactsPage.js', import.meta.url);
const contacts = await readFile(contactsPath, 'utf8');
const rootVercelConfig = JSON.parse(await readFile(new URL('../../vercel.json', import.meta.url), 'utf8'));
const webVercelConfig = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));

test('allows same-institution direct chat and gates cross-institution chat on accepted requests', () => {
  assert.match(migration, /private\.chat_direct_participants_are_allowed/);
  assert.match(migration, /sender\.tenant_id = recipient\.tenant_id/);
  assert.match(migration, /contact\.status = 'accepted'/);
  assert.match(migration, /sender\.role = 'superadmin'/);
  assert.match(migration, /conversation\.created_by = \([\s\S]*profile\.role = 'superadmin'/);
  assert.match(migration, /type = 'direct'[\s\S]*private\.chat_direct_participants_are_allowed/);
  assert.match(migration, /private\.chat_direct_conversation_is_allowed\(conversation\.id\)/);
});

test('exposes a safe cross-institution directory and permits cross-institution requests', () => {
  assert.match(migration, /same_instansi boolean/);
  assert.match(migration, /create function public\.list_chat_directory/);
  assert.match(migration, /profile\.role not in \('unprovisioned', 'demo'\)/);
  assert.match(migration, /recipient\.role = 'superadmin'/);
  assert.match(migration, /create or replace function private\.chat_contact_request_is_valid/);
  assert.doesNotMatch(migration, /profile\.email|auth_secret/i);
});

test('adds restricted realtime signaling rows for direct audio and video calls', () => {
  assert.match(migration, /create table if not exists public\.chat_call_signals/);
  assert.match(migration, /event_type in \('offer', 'answer', 'ice', 'end', 'reject'\)/);
  assert.match(migration, /recipient_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /sender_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /private\.chat_direct_conversation_is_allowed\(conversation_id\)/);
  assert.match(migration, /alter publication supabase_realtime add table public\.chat_call_signals/);
  assert.match(migration, /prune_expired_chat_call_signals/);
  assert.match(room, /getUserMedia/);
  assert.match(room, /createOffer\(\)/);
  assert.match(room, /createAnswer\(\)/);
  assert.match(room, /bi-telephone/);
  assert.match(room, /bi-camera-video/);
  assert.match(room, /VITE_WEBRTC_ICE_SERVERS/);
  for (const config of [rootVercelConfig, webVercelConfig]) {
    const policy = config.headers
      .find((header) => header.source === '/(.*)')
      .headers.find((header) => header.key === 'Permissions-Policy').value;
    assert.match(policy, /microphone=\(self\)/);
    assert.match(policy, /camera=\(self\)/);
  }
});

test('shows same-institution users as directly chat-ready and cross-institution users as request-gated', () => {
  assert.match(contacts, /person\.sameInstansi \|\| getState\(\)\.role === 'superadmin'/);
  assert.match(contacts, /st\?\.status === 'accepted' \|\| u\.sameInstansi/);
  assert.match(contacts, /Tambah kontak/);
});
