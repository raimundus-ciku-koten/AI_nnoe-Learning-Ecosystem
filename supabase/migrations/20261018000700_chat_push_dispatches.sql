create table if not exists public.chat_push_dispatches (
  message_id uuid primary key
    references public.chat_messages(id) on delete cascade,
  requested_by uuid not null
    references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.chat_push_dispatches enable row level security;
revoke all on table public.chat_push_dispatches from public, anon, authenticated;
grant all on table public.chat_push_dispatches to service_role;
