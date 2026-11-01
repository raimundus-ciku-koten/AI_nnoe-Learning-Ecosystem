create or replace function private.chat_call_uuid_array_is_valid(p_participant_ids uuid[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    p_participant_ids is not null
    and cardinality(p_participant_ids) between 2 and 4
    and array_position(p_participant_ids, null) is null
    and cardinality(p_participant_ids) = (
      select count(distinct participant.id)
      from unnest(p_participant_ids) as participant(id)
    )
$$;

create table if not exists public.chat_call_history (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  started_by uuid not null references auth.users(id) on delete restrict,
  participant_ids uuid[] not null
    check (private.chat_call_uuid_array_is_valid(participant_ids)),
  media_kind text not null check (media_kind in ('audio', 'video')),
  outcome text not null
    check (outcome in ('ringing', 'completed', 'missed', 'rejected', 'cancelled', 'failed')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at),
  check ((outcome = 'ringing') = (ended_at is null))
);

create index if not exists chat_call_history_participants_started_idx
  on public.chat_call_history using gin (participant_ids);
create index if not exists chat_call_history_started_at_idx
  on public.chat_call_history (started_at desc);

alter table public.chat_call_history enable row level security;

revoke all on table public.chat_call_history from public, anon, authenticated;
grant select on table public.chat_call_history to authenticated;
grant insert (id, conversation_id, started_by, participant_ids, media_kind, outcome, started_at)
  on table public.chat_call_history to authenticated;
grant update (outcome, ended_at)
  on table public.chat_call_history to authenticated;
grant all on table public.chat_call_history to service_role;

create or replace function private.delete_expired_chat_call_history()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count bigint;
begin
  delete from public.chat_call_history
  where started_at < now() - interval '90 days';

  get diagnostics deleted_count = row_count;
  return deleted_count;
end
$$;

revoke all on function private.delete_expired_chat_call_history()
  from public, anon, authenticated;
grant execute on function private.delete_expired_chat_call_history()
  to service_role;

create or replace function private.chat_call_participants_are_valid(
  p_conversation_id uuid,
  p_participant_ids uuid[],
  p_started_by uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
select
  p_participant_ids is not null
  and p_started_by = (select auth.uid())
  and (select public.current_user_is_active())
  and cardinality(p_participant_ids) between 2 and 4
    and array_position(p_participant_ids, null) is null
    and cardinality(p_participant_ids) = (
      select count(distinct participant.id)
      from unnest(p_participant_ids) as participant(id)
    )
    and not exists (
      select 1
      from unnest(p_participant_ids) as participant_id(id)
      left join public.profiles as profile on profile.id = participant_id.id
      where profile.id is null
        or profile.active is not true
        or profile.role = 'unprovisioned'
    )
    and exists (
      select 1
      from public.chat_conversations as conversation
      where conversation.id = p_conversation_id
        and (select auth.uid()) = any(conversation.participant_ids)
        and conversation.participant_ids @> p_participant_ids
        and (
          conversation.type = 'group'
          or (
            p_participant_ids @> conversation.participant_ids
            and conversation.participant_ids @> p_participant_ids
            and exists (
              select 1
              from public.chat_contacts as contact
              where contact.status = 'accepted'
                and (
                  (
                    contact.from_user_id = (select auth.uid())
                    and contact.to_user_id = any(p_participant_ids)
                  )
                  or (
                    contact.to_user_id = (select auth.uid())
                    and contact.from_user_id = any(p_participant_ids)
                  )
                )
            )
          )
        )
    )
$$;

revoke all on function private.chat_call_participants_are_valid(uuid, uuid[], uuid)
  from public, anon;
grant execute on function private.chat_call_participants_are_valid(uuid, uuid[], uuid)
  to authenticated;
revoke all on function private.chat_call_uuid_array_is_valid(uuid[])
  from public, anon;
grant execute on function private.chat_call_uuid_array_is_valid(uuid[])
  to authenticated, service_role;

drop policy if exists "Call participants read call history"
  on public.chat_call_history;
create policy "Call participants read call history"
  on public.chat_call_history
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and participant_ids @> array[(select auth.uid())]
    and started_at >= now() - interval '90 days'
  );

drop policy if exists "Active participants record calls"
  on public.chat_call_history;
create policy "Active participants record calls"
  on public.chat_call_history
  for insert
  to authenticated
  with check (
    private.chat_call_participants_are_valid(conversation_id, participant_ids, started_by)
    and outcome = 'ringing'
    and ended_at is null
    and started_at >= now() - interval '5 minutes'
    and started_at <= now() + interval '5 minutes'
  );

drop policy if exists "Call participants finish call records"
  on public.chat_call_history;
create policy "Call participants finish call records"
  on public.chat_call_history
  for update
  to authenticated
  using (
    (select public.current_user_is_active())
    and started_by = (select auth.uid())
    and participant_ids @> array[(select auth.uid())]
    and started_at >= now() - interval '90 days'
  )
  with check (
    started_by = (select auth.uid())
    and participant_ids @> array[(select auth.uid())]
    and outcome in ('completed', 'missed', 'rejected', 'cancelled', 'failed')
    and ended_at is not null
    and ended_at >= started_at
  );
