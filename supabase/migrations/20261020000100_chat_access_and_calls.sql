create or replace function private.chat_direct_participants_are_allowed(
  p_participant_ids uuid[],
  p_created_by uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_created_by = (select auth.uid())
    and private.chat_uuid_array_is_valid(p_participant_ids)
    and cardinality(p_participant_ids) = 2
    and p_created_by = any(p_participant_ids)
    and exists (
      select 1
      from public.profiles as sender
      join public.profiles as recipient
        on recipient.id = (
          select participant.id
          from unnest(p_participant_ids) as participant(id)
          where participant.id <> p_created_by
        )
      where sender.id = p_created_by
        and sender.active = true
        and sender.role <> 'unprovisioned'
        and recipient.active = true
        and recipient.role not in ('unprovisioned', 'demo')
        and (
          recipient.role = 'superadmin'
          or exists (
            select 1
            from public.tenants as tenant
            where tenant.id = recipient.tenant_id
              and tenant.active = true
          )
        )
        and (
          sender.role = 'superadmin'
          or sender.tenant_id = recipient.tenant_id
          or exists (
            select 1
            from public.chat_contacts as contact
            where contact.status = 'accepted'
              and (
                (contact.from_user_id = sender.id and contact.to_user_id = recipient.id)
                or (contact.to_user_id = sender.id and contact.from_user_id = recipient.id)
              )
          )
        )
        and (
          sender.role = 'superadmin'
          or exists (
            select 1
            from public.tenants as tenant
            where tenant.id = sender.tenant_id
              and tenant.active = true
          )
          or exists (
            select 1
            from public.chat_contacts as contact
            where contact.status = 'accepted'
              and (
                (contact.from_user_id = sender.id and contact.to_user_id = recipient.id)
                or (contact.to_user_id = sender.id and contact.from_user_id = recipient.id)
              )
          )
        )
    )
$$;

create or replace function private.chat_direct_conversation_is_allowed(
  p_conversation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select public.current_user_is_active())
    and exists (
      select 1
      from public.chat_conversations as conversation
      join public.profiles as sender
        on sender.id = (select auth.uid())
      join public.profiles as recipient
        on recipient.id = (
          select participant.id
          from unnest(conversation.participant_ids) as participant(id)
          where participant.id <> (select auth.uid())
        )
      where conversation.id = p_conversation_id
        and conversation.type = 'direct'
        and conversation.participant_ids @> array[(select auth.uid())]
        and sender.active = true
        and sender.role <> 'unprovisioned'
        and recipient.active = true
        and recipient.role not in ('unprovisioned', 'demo')
        and (
          recipient.role = 'superadmin'
          or exists (
            select 1
            from public.tenants as tenant
            where tenant.id = recipient.tenant_id
              and tenant.active = true
          )
        )
        and (
          sender.role = 'superadmin'
          or conversation.created_by = (
            select profile.id
            from public.profiles as profile
            where profile.id = conversation.created_by
              and profile.role = 'superadmin'
          )
          or (
            sender.tenant_id = recipient.tenant_id
            and exists (
              select 1
              from public.tenants as tenant
              where tenant.id = sender.tenant_id
                and tenant.active = true
            )
          )
          or exists (
            select 1
            from public.chat_contacts as contact
            where contact.status = 'accepted'
              and (
                (contact.from_user_id = sender.id and contact.to_user_id = recipient.id)
                or (contact.to_user_id = sender.id and contact.from_user_id = recipient.id)
              )
          )
        )
    )
$$;

revoke all on function private.chat_direct_participants_are_allowed(uuid[], uuid)
  from public, anon;
revoke all on function private.chat_direct_conversation_is_allowed(uuid)
  from public, anon;
grant execute on function private.chat_direct_participants_are_allowed(uuid[], uuid)
  to authenticated;
grant execute on function private.chat_direct_conversation_is_allowed(uuid)
  to authenticated;

drop policy if exists "Chat participants read conversations"
  on public.chat_conversations;
create policy "Chat participants read conversations"
  on public.chat_conversations
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and participant_ids @> array[(select auth.uid())]
    and (
      type = 'group'
      or private.chat_direct_conversation_is_allowed(id)
    )
  );

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
        and (
          conversation.type = 'group'
          or private.chat_direct_conversation_is_allowed(conversation.id)
        )
    )
  );

drop policy if exists "Conversation participants read read receipts"
  on public.chat_read_receipts;
create policy "Conversation participants read read receipts"
  on public.chat_read_receipts
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and exists (
      select 1
      from public.chat_conversations as conversation
      where conversation.id = chat_read_receipts.conversation_id
        and conversation.participant_ids @> array[(select auth.uid())]
        and (
          conversation.type = 'group'
          or private.chat_direct_conversation_is_allowed(conversation.id)
        )
    )
  );

drop policy if exists "Users create their own chat read receipts"
  on public.chat_read_receipts;
create policy "Users create their own chat read receipts"
  on public.chat_read_receipts
  for insert
  to authenticated
  with check (
    (select public.current_user_is_active())
    and user_id = (select auth.uid())
    and last_read_at <= now()
    and exists (
      select 1
      from public.chat_conversations as conversation
      where conversation.id = chat_read_receipts.conversation_id
        and conversation.participant_ids @> array[(select auth.uid())]
        and (
          conversation.type = 'group'
          or private.chat_direct_conversation_is_allowed(conversation.id)
        )
    )
  );

drop policy if exists "Users update their own chat read receipts"
  on public.chat_read_receipts;
create policy "Users update their own chat read receipts"
  on public.chat_read_receipts
  for update
  to authenticated
  using (
    (select public.current_user_is_active())
    and user_id = (select auth.uid())
    and exists (
      select 1
      from public.chat_conversations as conversation
      where conversation.id = chat_read_receipts.conversation_id
        and conversation.participant_ids @> array[(select auth.uid())]
        and (
          conversation.type = 'group'
          or private.chat_direct_conversation_is_allowed(conversation.id)
        )
    )
  )
  with check (
    (select public.current_user_is_active())
    and user_id = (select auth.uid())
    and last_read_at <= now()
    and exists (
      select 1
      from public.chat_conversations as conversation
      where conversation.id = chat_read_receipts.conversation_id
        and conversation.participant_ids @> array[(select auth.uid())]
        and (
          conversation.type = 'group'
          or private.chat_direct_conversation_is_allowed(conversation.id)
        )
    )
  );

drop policy if exists "Users delete their own chat read receipts"
  on public.chat_read_receipts;
create policy "Users delete their own chat read receipts"
  on public.chat_read_receipts
  for delete
  to authenticated
  using (
    (select public.current_user_is_active())
    and user_id = (select auth.uid())
    and exists (
      select 1
      from public.chat_conversations as conversation
      where conversation.id = chat_read_receipts.conversation_id
        and conversation.participant_ids @> array[(select auth.uid())]
        and (
          conversation.type = 'group'
          or private.chat_direct_conversation_is_allowed(conversation.id)
        )
    )
  );

drop policy if exists "Active users read presence timestamps"
  on public.chat_presence;
create policy "Active users read presence timestamps"
  on public.chat_presence
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and exists (
      select 1
      from public.profiles as viewer
      join public.profiles as viewed on viewed.id = chat_presence.user_id
      where viewer.id = (select auth.uid())
        and viewed.active = true
        and viewed.role not in ('unprovisioned', 'demo')
        and (
          viewer.role = 'superadmin'
          or viewer.tenant_id = viewed.tenant_id
          or exists (
            select 1
            from public.chat_contacts as contact
            where contact.status = 'accepted'
              and (
                (contact.from_user_id = viewer.id and contact.to_user_id = viewed.id)
                or (contact.to_user_id = viewer.id and contact.from_user_id = viewed.id)
              )
          )
        )
    )
  );

drop policy if exists "Active users send same-tenant contact requests"
  on public.chat_contacts;
create policy "Active users send same-tenant contact requests"
  on public.chat_contacts
  for insert
  to authenticated
  with check (
    status = 'pending'
    and private.chat_contact_request_is_valid(
      from_user_id,
      to_user_id,
      participant_names
    )
  );

create or replace function private.chat_contact_request_is_valid(
  p_from_user_id uuid,
  p_to_user_id uuid,
  p_participant_names jsonb
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_from_user_id = (select auth.uid())
    and p_from_user_id <> p_to_user_id
    and (select public.current_user_is_active())
    and jsonb_typeof(p_participant_names) = 'object'
    and p_participant_names ? p_from_user_id::text
    and p_participant_names ? p_to_user_id::text
    and (select count(*) from jsonb_object_keys(p_participant_names)) = 2
    and jsonb_typeof(p_participant_names -> p_from_user_id::text) = 'string'
    and jsonb_typeof(p_participant_names -> p_to_user_id::text) = 'string'
    and char_length(p_participant_names ->> p_from_user_id::text) between 1 and 120
    and char_length(p_participant_names ->> p_to_user_id::text) between 1 and 120
    and p_participant_names ->> p_from_user_id::text =
      btrim(p_participant_names ->> p_from_user_id::text)
    and p_participant_names ->> p_to_user_id::text =
      btrim(p_participant_names ->> p_to_user_id::text)
    and exists (
      select 1
      from public.profiles as sender
      join public.profiles as recipient on recipient.id = p_to_user_id
      where sender.id = p_from_user_id
        and sender.active = true
        and sender.role <> 'unprovisioned'
        and recipient.active = true
        and recipient.role not in ('unprovisioned', 'demo')
        and (
          recipient.role = 'superadmin'
          or exists (
            select 1
            from public.tenants as tenant
            where tenant.id = recipient.tenant_id
              and tenant.active = true
          )
        )
        and (
          sender.role = 'superadmin'
          or exists (
            select 1
            from public.tenants as tenant
            where tenant.id = sender.tenant_id
              and tenant.active = true
          )
        )
    )
$$;

revoke all on function private.chat_contact_request_is_valid(uuid, uuid, jsonb)
  from public, anon;
grant execute on function private.chat_contact_request_is_valid(uuid, uuid, jsonb)
  to authenticated;

drop policy if exists "Active users create conversations"
  on public.chat_conversations;
create policy "Active users create conversations"
  on public.chat_conversations
  for insert
  to authenticated
  with check (
    (
      type = 'group'
      and private.chat_participants_are_valid(participant_ids, created_by)
    )
    or (
      type = 'direct'
      and private.chat_direct_participants_are_allowed(participant_ids, created_by)
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
        and (
          conversation.type = 'group'
          or private.chat_direct_conversation_is_allowed(conversation.id)
        )
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

drop function if exists public.list_chat_directory();
create function public.list_chat_directory()
returns table (
  uid uuid,
  nama text,
  role text,
  photo_url text,
  same_instansi boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    profile.id,
    profile.nama,
    profile.role,
    profile.photo_url,
    profile.tenant_id = (select public.current_tenant_id())
  from public.profiles as profile
  where (select public.current_user_is_active())
    and profile.id <> (select auth.uid())
    and profile.active = true
    and profile.role not in ('unprovisioned', 'demo')
    and (
      profile.role = 'superadmin'
      or exists (
        select 1
        from public.tenants as tenant
        where tenant.id = profile.tenant_id
          and tenant.active = true
      )
    )
  order by profile.nama, profile.id
$$;

revoke all on function public.list_chat_directory() from public, anon;
grant execute on function public.list_chat_directory() to authenticated;

create table if not exists public.chat_call_signals (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null,
  conversation_id uuid not null
    references public.chat_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (
    event_type in ('offer', 'answer', 'ice', 'end', 'reject')
  ),
  payload jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(payload) = 'object'
      and octet_length(payload::text) <= 65536
    ),
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id),
  check (
    (
      event_type = 'offer'
      and payload ->> 'type' = 'offer'
      and jsonb_typeof(payload -> 'sdp') = 'string'
      and char_length(payload ->> 'sdp') between 1 and 60000
      and payload ->> 'media' in ('audio', 'video')
    )
    or (
      event_type = 'answer'
      and payload ->> 'type' = 'answer'
      and jsonb_typeof(payload -> 'sdp') = 'string'
      and char_length(payload ->> 'sdp') between 1 and 60000
    )
    or (
      event_type = 'ice'
      and jsonb_typeof(payload -> 'candidate') = 'object'
    )
    or (
      event_type in ('end', 'reject')
      and payload = '{}'::jsonb
    )
  ) is true
);

create index if not exists chat_call_signals_recipient_created_idx
  on public.chat_call_signals (recipient_id, created_at);
create index if not exists chat_call_signals_call_id_idx
  on public.chat_call_signals (call_id);
create index if not exists chat_call_signals_created_at_idx
  on public.chat_call_signals (created_at);

create or replace function private.prune_expired_chat_call_signals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.chat_call_signals
  where created_at < now() - interval '1 day';
  return new;
end;
$$;

revoke all on function private.prune_expired_chat_call_signals()
  from public, anon, authenticated;

drop trigger if exists chat_call_signals_prune_expired
  on public.chat_call_signals;
create trigger chat_call_signals_prune_expired
  before insert on public.chat_call_signals
  for each statement execute function private.prune_expired_chat_call_signals();

alter table public.chat_call_signals enable row level security;
revoke all on table public.chat_call_signals from public, anon, authenticated;
grant select on table public.chat_call_signals to authenticated;
grant insert (
  call_id,
  conversation_id,
  sender_id,
  recipient_id,
  event_type,
  payload
) on table public.chat_call_signals to authenticated;
grant all on table public.chat_call_signals to service_role;

create policy "Call participants read addressed signals"
  on public.chat_call_signals
  for select
  to authenticated
  using (
    recipient_id = (select auth.uid())
    and private.chat_direct_conversation_is_allowed(conversation_id)
  );

create policy "Call participants send addressed signals"
  on public.chat_call_signals
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and recipient_id <> sender_id
    and private.chat_direct_conversation_is_allowed(conversation_id)
    and exists (
      select 1
      from public.chat_conversations as conversation
      where conversation.id = chat_call_signals.conversation_id
        and conversation.type = 'direct'
        and conversation.participant_ids @> array[chat_call_signals.recipient_id]
    )
  );

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_call_signals'
  ) then
    alter publication supabase_realtime add table public.chat_call_signals;
  end if;
end;
$$;
