create table if not exists public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null check (length(endpoint) between 1 and 4096),
  p256dh text not null check (length(p256dh) between 1 and 512),
  auth_secret text not null check (length(auth_secret) between 1 and 512),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table public.web_push_subscriptions enable row level security;

drop trigger if exists web_push_subscriptions_set_updated_at
  on public.web_push_subscriptions;
create trigger web_push_subscriptions_set_updated_at
  before update on public.web_push_subscriptions
  for each row execute function public.set_updated_at();

create policy web_push_subscriptions_select_own
  on public.web_push_subscriptions
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy web_push_subscriptions_insert_own
  on public.web_push_subscriptions
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and length(endpoint) between 1 and 4096
    and length(p256dh) between 1 and 512
    and length(auth_secret) between 1 and 512
  );

create policy web_push_subscriptions_update_own
  on public.web_push_subscriptions
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and length(endpoint) between 1 and 4096
    and length(p256dh) between 1 and 512
    and length(auth_secret) between 1 and 512
  );

create policy web_push_subscriptions_delete_own
  on public.web_push_subscriptions
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

grant select, delete on public.web_push_subscriptions to authenticated;
grant insert (user_id, endpoint, p256dh, auth_secret)
  on public.web_push_subscriptions to authenticated;
grant update (endpoint, p256dh, auth_secret)
  on public.web_push_subscriptions to authenticated;
grant all on public.web_push_subscriptions to service_role;
