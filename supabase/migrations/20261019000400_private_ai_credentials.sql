create table if not exists public.user_ai_credentials (
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('gemini', 'deepseek', 'groq', 'claude', 'canva')),
  encrypted_secret jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

alter table public.user_ai_credentials enable row level security;
revoke all on table public.user_ai_credentials from public, anon, authenticated;
grant all on table public.user_ai_credentials to service_role;

create table if not exists public.canva_oauth_states (
  state_hash text primary key check (state_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references public.profiles(id) on delete cascade,
  code_verifier text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.canva_oauth_states enable row level security;
revoke all on table public.canva_oauth_states from public, anon, authenticated;
grant all on table public.canva_oauth_states to service_role;

create index if not exists canva_oauth_states_expires_at_idx
  on public.canva_oauth_states (expires_at);
-- Keep personal AI keys and OAuth tokens server-side; browser roles have no access.
