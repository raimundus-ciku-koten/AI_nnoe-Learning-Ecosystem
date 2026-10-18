create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.chat_conversations(id) on delete restrict,
  sender_id uuid not null references auth.users(id) on delete restrict,
  type text not null check (type in ('text', 'image', 'file')),
  body text,
  drive_file_index_id uuid
    references public.drive_file_index(id) on delete restrict,
  file_name text check (file_name is null or char_length(file_name) <= 200),
  file_size bigint,
  created_at timestamptz not null default now(),
  check (
    (
      type = 'text'
      and body is not null
      and char_length(body) between 1 and 2000
      and drive_file_index_id is null
      and file_name is null
      and file_size is null
    )
    or (
      type in ('image', 'file')
      and body is null
      and drive_file_index_id is not null
      and file_size is not null
      and file_size between 1 and 2097152
    )
  )
);

create index if not exists chat_messages_conversation_created_idx
  on public.chat_messages (conversation_id, created_at, id);
create index if not exists chat_messages_drive_file_index_idx
  on public.chat_messages (drive_file_index_id)
  where drive_file_index_id is not null;

create or replace function private.chat_drive_attachment_is_shareable(
  p_drive_file_index_id uuid,
  p_sender_id uuid,
  p_conversation_id uuid,
  p_source_file_size bigint
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_sender_id = (select auth.uid())
    and (select public.current_user_is_active())
    and exists (
      select 1
      from public.chat_conversations as conversation
      join public.drive_file_index as drive_file
        on drive_file.id = p_drive_file_index_id
      join public.profiles as sender
        on sender.id = p_sender_id
      join public.tenants as tenant
        on tenant.id = drive_file.tenant_id
      where conversation.id = p_conversation_id
        and p_sender_id = any(conversation.participant_ids)
        and sender.active = true
        and sender.role <> 'unprovisioned'
        and drive_file.owner_id = p_sender_id
        and drive_file.category = 'communication'
        and drive_file.revoked_at is null
        and drive_file.ciphertext_sha256 ~ '^[a-f0-9]{64}$'
        and drive_file.ciphertext_size_bytes between 1 and 10489856
        and drive_file.ciphertext_size_bytes >= p_source_file_size
        and drive_file.encryption_version > 0
        and tenant.active = true
        and (
          sender.role = 'superadmin'
          or sender.tenant_id = drive_file.tenant_id
        )
        and not exists (
          select 1
          from unnest(conversation.participant_ids) as participant(id)
          left join public.profiles as recipient
            on recipient.id = participant.id
          left join public.user_encryption_keys as encryption_key
            on encryption_key.user_id = participant.id
          left join public.drive_file_key_envelopes as envelope
            on envelope.file_id = drive_file.id
            and envelope.recipient_id = participant.id
          where recipient.id is null
            or recipient.active is not true
            or recipient.role = 'unprovisioned'
            or encryption_key.user_id is null
            or envelope.file_id is null
            or envelope.revoked_at is not null
            or envelope.recipient_key_fingerprint <> encryption_key.fingerprint
            or envelope.key_version <> encryption_key.key_version
        )
        and not exists (
          select 1
          from unnest(conversation.participant_ids) as participant(id)
          where participant.id <> p_sender_id
            and not exists (
              select 1
              from public.drive_file_access as drive_access
              where drive_access.file_id = drive_file.id
                and drive_access.grantee_id = participant.id
                and drive_access.revoked_at is null
                and drive_access.access_level in ('read', 'write')
            )
        )
    )
$$;

revoke all on function private.chat_drive_attachment_is_shareable(uuid, uuid, uuid, bigint)
  from public, anon;
grant execute on function private.chat_drive_attachment_is_shareable(uuid, uuid, uuid, bigint)
  to authenticated;

alter table public.chat_messages enable row level security;

revoke all on table public.chat_messages from public, anon, authenticated;
grant select on table public.chat_messages to authenticated;
grant insert (
  conversation_id,
  sender_id,
  type,
  body,
  drive_file_index_id,
  file_name,
  file_size
) on table public.chat_messages to authenticated;
grant all on table public.chat_messages to service_role;

drop policy if exists "Conversation participants read messages"
  on public.chat_messages;
create policy "Conversation participants read messages"
  on public.chat_messages
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and exists (
      select 1
      from public.chat_conversations as conversation
      where conversation.id = chat_messages.conversation_id
        and conversation.participant_ids @> array[(select auth.uid())]
    )
  );

drop policy if exists "Participants create immutable messages"
  on public.chat_messages;
create policy "Participants create immutable messages"
  on public.chat_messages
  for insert
  to authenticated
  with check (
    (select public.current_user_is_active())
    and sender_id = (select auth.uid())
    and exists (
      select 1
      from public.chat_conversations as conversation
      where conversation.id = chat_messages.conversation_id
        and conversation.participant_ids @> array[(select auth.uid())]
    )
    and (
      type = 'text'
      or private.chat_drive_attachment_is_shareable(
        drive_file_index_id,
        sender_id,
        conversation_id,
        file_size
      )
    )
  );
