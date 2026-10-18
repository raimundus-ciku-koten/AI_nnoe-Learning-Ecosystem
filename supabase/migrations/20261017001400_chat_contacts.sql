create table if not exists public.chat_contacts (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references auth.users(id) on delete restrict,
  to_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null check (status in ('pending', 'accepted')),
  participant_names jsonb not null
    check (jsonb_typeof(participant_names) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  check (from_user_id <> to_user_id)
);

create unique index if not exists chat_contacts_pair_unique_idx
  on public.chat_contacts (
    least(from_user_id, to_user_id),
    greatest(from_user_id, to_user_id)
  );
create index if not exists chat_contacts_from_status_idx
  on public.chat_contacts (from_user_id, status);
create index if not exists chat_contacts_to_status_idx
  on public.chat_contacts (to_user_id, status);

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
      join public.profiles as recipient
        on recipient.id = p_to_user_id
      where sender.id = (select auth.uid())
        and sender.active = true
        and sender.role <> 'unprovisioned'
        and recipient.active = true
        and recipient.role <> 'unprovisioned'
        and (
          (
            sender.role = 'superadmin'
            and (
              recipient.role = 'superadmin'
              or exists (
                select 1
                from public.tenants as tenant
                where tenant.id = recipient.tenant_id
                  and tenant.active = true
              )
            )
          )
          or (
            sender.role <> 'superadmin'
            and sender.tenant_id = recipient.tenant_id
            and sender.tenant_id = (select public.current_tenant_id())
            and exists (
              select 1
              from public.tenants as tenant
              where tenant.id = sender.tenant_id
                and tenant.active = true
            )
          )
        )
    )
$$;

revoke all on function private.chat_contact_request_is_valid(uuid, uuid, jsonb)
  from public, anon;
grant execute on function private.chat_contact_request_is_valid(uuid, uuid, jsonb)
  to authenticated;

drop trigger if exists chat_contacts_set_updated_at on public.chat_contacts;
create trigger chat_contacts_set_updated_at
  before update on public.chat_contacts
  for each row execute function public.set_updated_at();

alter table public.chat_contacts enable row level security;

revoke all on table public.chat_contacts from public, anon, authenticated;
grant select, delete on table public.chat_contacts to authenticated;
grant insert (from_user_id, to_user_id, status, participant_names)
  on table public.chat_contacts to authenticated;
grant update (status) on table public.chat_contacts to authenticated;
grant all on table public.chat_contacts to service_role;

drop policy if exists "Contact participants read their relation"
  on public.chat_contacts;
create policy "Contact participants read their relation"
  on public.chat_contacts
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and (from_user_id = (select auth.uid()) or to_user_id = (select auth.uid()))
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

drop policy if exists "Recipients accept pending contact requests"
  on public.chat_contacts;
create policy "Recipients accept pending contact requests"
  on public.chat_contacts
  for update
  to authenticated
  using (
    (select public.current_user_is_active())
    and to_user_id = (select auth.uid())
    and status = 'pending'
  )
  with check (
    (select public.current_user_is_active())
    and to_user_id = (select auth.uid())
    and status = 'accepted'
  );

drop policy if exists "Contact participants delete their relation"
  on public.chat_contacts;
create policy "Contact participants delete their relation"
  on public.chat_contacts
  for delete
  to authenticated
  using (
    (select public.current_user_is_active())
    and (from_user_id = (select auth.uid()) or to_user_id = (select auth.uid()))
  );

drop policy if exists "Active users create conversations"
  on public.chat_conversations;
create policy "Active users create conversations"
  on public.chat_conversations
  for insert
  to authenticated
  with check (
    private.chat_participants_are_valid(participant_ids, created_by)
    and (
      type = 'group'
      or exists (
        select 1
        from unnest(participant_ids) as other_member(id)
        join public.chat_contacts as contact
          on (
            (
              contact.from_user_id = (select auth.uid())
              and contact.to_user_id = other_member.id
            )
            or (
              contact.to_user_id = (select auth.uid())
              and contact.from_user_id = other_member.id
            )
          )
        where other_member.id <> (select auth.uid())
          and contact.status = 'accepted'
      )
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
          or exists (
            select 1
            from unnest(conversation.participant_ids) as other_member(id)
            join public.chat_contacts as contact
              on (
                (
                  contact.from_user_id = (select auth.uid())
                  and contact.to_user_id = other_member.id
                )
                or (
                  contact.to_user_id = (select auth.uid())
                  and contact.from_user_id = other_member.id
                )
              )
            where other_member.id <> (select auth.uid())
              and contact.status = 'accepted'
          )
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
