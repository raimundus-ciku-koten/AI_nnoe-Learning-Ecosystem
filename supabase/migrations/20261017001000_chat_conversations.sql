create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.chat_uuid_array_is_valid(p_participant_ids uuid[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    p_participant_ids is not null
    and cardinality(p_participant_ids) between 2 and 50
    and array_position(p_participant_ids, null) is null
    and cardinality(p_participant_ids) = (
      select count(distinct participant.id)
      from unnest(p_participant_ids) as participant(id)
    )
$$;

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('direct', 'group')),
  title text check (
    title is null
    or (
      char_length(title) between 1 and 80
      and title = btrim(title)
    )
  ),
  participant_ids uuid[] not null
    check (private.chat_uuid_array_is_valid(participant_ids)),
  participant_names jsonb not null
    check (jsonb_typeof(participant_names) = 'object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (type <> 'direct' or cardinality(participant_ids) = 2)
);

create index if not exists chat_conversations_participant_ids_idx
  on public.chat_conversations using gin (participant_ids);

alter table public.chat_conversations enable row level security;

revoke all on table public.chat_conversations from public, anon, authenticated;
grant select on table public.chat_conversations to authenticated;
grant insert (type, title, participant_ids, participant_names, created_by)
  on public.chat_conversations to authenticated;
grant update (type, title, participant_ids, participant_names)
  on public.chat_conversations to authenticated;
grant all on table public.chat_conversations to service_role;

create or replace function private.chat_participants_are_valid(
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
    and p_created_by = any(p_participant_ids)
    and private.chat_uuid_array_is_valid(p_participant_ids)
    and exists (
      select 1
      from public.profiles as creator
      where creator.id = (select auth.uid())
        and creator.active = true
        and creator.role <> 'unprovisioned'
    )
    and not exists (
      select 1
      from unnest(p_participant_ids) as participant_id(id)
      left join public.profiles as profile
        on profile.id = participant_id.id
      where profile.id is null
        or profile.active is not true
        or profile.role = 'unprovisioned'
    )
    and (
      exists (
        select 1
        from public.profiles as creator
        where creator.id = (select auth.uid())
          and creator.role = 'superadmin'
      )
      or not exists (
        select 1
        from unnest(p_participant_ids) as participant_id(id)
        join public.profiles as profile
          on profile.id = participant_id.id
        join public.profiles as creator
          on creator.id = (select auth.uid())
        where profile.tenant_id is distinct from creator.tenant_id
      )
    )
$$;

revoke all on function private.chat_uuid_array_is_valid(uuid[]) from public, anon;
revoke all on function private.chat_participants_are_valid(uuid[], uuid)
  from public, anon;
grant execute on function private.chat_uuid_array_is_valid(uuid[])
  to authenticated, service_role;
grant execute on function private.chat_participants_are_valid(uuid[], uuid)
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
  );

drop policy if exists "Active users create conversations"
  on public.chat_conversations;
create policy "Active users create conversations"
  on public.chat_conversations
  for insert
  to authenticated
  with check (
    private.chat_participants_are_valid(participant_ids, created_by)
  );

drop policy if exists "Conversation creators update metadata"
  on public.chat_conversations;
create policy "Conversation creators update metadata"
  on public.chat_conversations
  for update
  to authenticated
  using (
    created_by = (select auth.uid())
    and (select public.current_user_is_active())
    and participant_ids @> array[(select auth.uid())]
  )
  with check (
    private.chat_participants_are_valid(participant_ids, created_by)
  );
