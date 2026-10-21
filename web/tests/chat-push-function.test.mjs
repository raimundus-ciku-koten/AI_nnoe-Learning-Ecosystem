import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const functionSource = await readFile(
  new URL('../../supabase/functions/chat-push/index.ts', import.meta.url),
  'utf8',
);
const dispatchMigration = await readFile(
  new URL('../../supabase/migrations/20261018000700_chat_push_dispatches.sql', import.meta.url),
  'utf8',
);
const functionConfig = await readFile(
  new URL('../../supabase/config.toml', import.meta.url),
  'utf8',
);
const chatServiceSource = await readFile(
  new URL('../src/services/chat.js', import.meta.url),
  'utf8',
);
const chatAttachmentMigration = await readFile(
  new URL('../../supabase/migrations/20261018000800_chat_drive_attachment_registration.sql', import.meta.url),
  'utf8',
);

test('requires an authenticated caller and validates the sender-owned message', () => {
  assert.match(functionConfig, /\[functions\.chat-push\]\s+verify_jwt = true/);
  assert.match(functionSource, /Bearer\\s\+\(.+\)/);
  assert.match(functionSource, /supabase\.auth\.getUser\(token\)/);
  assert.match(functionSource, /message\.sender_id !== authData\.user\.id/);
  assert.match(functionSource, /!conversation\.participant_ids\.includes\(authData\.user\.id\)/);
  assert.match(functionSource, /sender\.active/);
});

test('sends generic notifications only to active, eligible conversation participants', () => {
  assert.match(functionSource, /profile\.active/);
  assert.match(functionSource, /profile\.role !== 'unprovisioned'/);
  assert.match(functionSource, /activeTenantIds\.has\(profile\.tenant_id\)/);
  assert.match(functionSource, /\.in\('user_id', eligibleRecipients\)/);
  assert.match(functionSource, /body: 'Anda menerima pesan baru di chat\.'/);
  assert.doesNotMatch(functionSource, /\.select\('id,conversation_id,sender_id,type,body/);
  assert.doesNotMatch(functionSource, /body:\s*message\.body/);
});

test('validates Web Push destinations and discards expired subscriptions', () => {
  assert.match(functionSource, /url\.protocol === 'https:'/);
  assert.match(functionSource, /fcm\.googleapis\.com/);
  assert.match(functionSource, /push\.services\.mozilla\.com/);
  assert.match(functionSource, /web\.push\.apple\.com/);
  assert.match(functionSource, /notify\.windows\.com/);
  assert.match(functionSource, /statusCode === 404 \|\| statusCode === 410/);
  assert.match(functionSource, /\.delete\(\)[\s\S]*?\.eq\('id', subscription\.id\)/);
});

test('deduplicates dispatches by immutable message ID with service-role-only access', () => {
  assert.match(functionSource, /from\('chat_push_dispatches'\)[\s\S]*?onConflict: 'message_id', ignoreDuplicates: true/);
  assert.match(dispatchMigration, /message_id uuid primary key[\s\S]*?references public\.chat_messages\(id\)/);
  assert.match(dispatchMigration, /enable row level security/);
  assert.match(dispatchMigration, /revoke all on table public\.chat_push_dispatches from public, anon, authenticated/);
  assert.match(dispatchMigration, /grant all on table public\.chat_push_dispatches to service_role/);
  assert.match(functionConfig, /\[functions\.chat-push\]\s+verify_jwt = true/);
});

test('dispatches push after sending a message, not after creating a conversation', () => {
  const createConversation = chatServiceSource.slice(
    chatServiceSource.indexOf('export async function mulaiChatPribadi'),
    chatServiceSource.indexOf('export async function buatGrup'),
  );
  const sendMessage = chatServiceSource.slice(
    chatServiceSource.indexOf('export async function kirimPesan'),
    chatServiceSource.indexOf('export async function unggahBerkas'),
  );

  assert.doesNotMatch(createConversation, /chat-push|kirimNotifikasiPesan/);
  assert.match(sendMessage, /await kirimNotifikasiPesan\(data\.id\)/);
});

test('limits recipient-key lookup and attachment registration to active conversation members', () => {
  assert.match(chatAttachmentMigration, /function public\.list_chat_attachment_recipients/);
  assert.match(chatAttachmentMigration, /security definer\s+set search_path = ''/);
  assert.match(chatAttachmentMigration, /auth\.uid\(\).*?current_user_is_active/s);
  assert.match(chatAttachmentMigration, /auth\.uid\(\)\)\s*=\s*any\(conversation\.participant_ids\)/);
  assert.match(chatAttachmentMigration, /profile\.tenant_id = requester\.tenant_id/);
  assert.match(chatAttachmentMigration, /function public\.register_chat_drive_attachment/);
  assert.match(chatAttachmentMigration, /"recipientKeyFingerprint".*?encryption_key\.fingerprint/s);
  assert.match(chatAttachmentMigration, /envelope\."keyVersion".*?encryption_key\.key_version/s);
  assert.match(chatAttachmentMigration, /'communication'/);
  assert.match(chatAttachmentMigration, /insert into public\.chat_messages/);
  assert.match(chatAttachmentMigration, /when 'image' then 'Foto terenkripsi'[\s\S]*?else 'Lampiran terenkripsi'/);
  assert.match(chatAttachmentMigration, /grant execute on function public\.register_chat_drive_attachment/);
  assert.doesNotMatch(chatAttachmentMigration, /grant (insert|update|all) on table public\.(drive_file_index|drive_file_access|drive_file_key_envelopes) to authenticated/i);
  assert.match(chatServiceSource, /rpc\(\s*'list_chat_attachment_recipients'/);
  assert.match(chatServiceSource, /unggahLampiranChatDrive\(/);
  assert.match(chatServiceSource, /rpc\('register_chat_drive_attachment'/);
  assert.match(chatServiceSource, /unduhLampiranChatDrive\(/);
});
