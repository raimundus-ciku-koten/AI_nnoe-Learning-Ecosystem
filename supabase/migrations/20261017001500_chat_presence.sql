create table if not exists public.chat_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null
);

alter table public.chat_presence enable row level security;

revoke all on table public.chat_presence from public, anon, authenticated;
grant select, delete on table public.chat_presence to authenticated;
grant insert (user_id, last_seen_at)
  on table public.chat_presence to authenticated;
grant update (last_seen_at)
  on table public.chat_presence to authenticated;
grant all on table public.chat_presence to service_role;

drop policy if exists "Active users read presence timestamps"
  on public.chat_presence;
create policy "Active users read presence timestamps"
  on public.chat_presence
  for select
  to authenticated
  using ((select public.current_user_is_active()));

drop policy if exists "Users write their own presence timestamp"
  on public.chat_presence;
create policy "Users write their own presence timestamp"
  on public.chat_presence
  for insert
  to authenticated
  with check (
    (select public.current_user_is_active())
    and user_id = (select auth.uid())
    and last_seen_at <= now()
  );

drop policy if exists "Users update their own presence timestamp"
  on public.chat_presence;
create policy "Users update their own presence timestamp"
  on public.chat_presence
  for update
  to authenticated
  using (
    (select public.current_user_is_active())
    and user_id = (select auth.uid())
  )
  with check (
    (select public.current_user_is_active())
    and user_id = (select auth.uid())
    and last_seen_at <= now()
  );

drop policy if exists "Users delete their own presence timestamp"
  on public.chat_presence;
create policy "Users delete their own presence timestamp"
  on public.chat_presence
  for delete
  to authenticated
  using (
    (select public.current_user_is_active())
    and user_id = (select auth.uid())
  );
