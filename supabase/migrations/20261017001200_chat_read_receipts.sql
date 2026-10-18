create table if not exists public.chat_read_receipts (
  conversation_id uuid not null
    references public.chat_conversations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null,
  primary key (conversation_id, user_id)
);

alter table public.chat_read_receipts enable row level security;

revoke all on table public.chat_read_receipts from public, anon, authenticated;
grant select, delete on table public.chat_read_receipts to authenticated;
grant insert (conversation_id, user_id, last_read_at)
  on table public.chat_read_receipts to authenticated;
grant update (last_read_at)
  on table public.chat_read_receipts to authenticated;
grant all on table public.chat_read_receipts to service_role;

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
    )
  );
