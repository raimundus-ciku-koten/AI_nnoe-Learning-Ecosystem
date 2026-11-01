create table if not exists public.oauth_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  service text not null check (service in ('drive', 'tasks', 'calendar')),
  provider_subject text not null,
  email text not null check (char_length(email) between 3 and 320),
  refresh_token_ciphertext text not null,
  key_version smallint not null check (key_version > 0),
  granted_scopes text[] not null default '{}',
  status text not null default 'connected'
    check (status in ('connected', 'reauth_required', 'revoked')),
  connected_at timestamptz not null default now(),
  last_refresh_at timestamptz,
  revoked_at timestamptz,
  unique (user_id, service)
);

create table if not exists public.oauth_pending (
  state_hash text primary key check (state_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text not null check (char_length(user_email) between 3 and 320),
  service text not null check (service in ('drive', 'tasks', 'calendar')),
  code_verifier_ciphertext text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.integration_sync_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  service text not null check (service in ('drive', 'tasks', 'calendar')),
  resource text not null check (resource in ('files', 'tasks', 'events')),
  cursor text,
  page_cursor text,
  last_started_at timestamptz,
  last_success_at timestamptz,
  status text not null default 'not_connected'
    check (status in ('not_connected', 'consent_required', 'connected', 'syncing',
      'retry_wait', 'reauth_required', 'revoked', 'error')),
  retry_count integer not null default 0 check (retry_count >= 0),
  next_retry_at timestamptz,
  last_error_code text check (last_error_code is null or char_length(last_error_code) <= 80),
  updated_at timestamptz not null default now(),
  primary key (user_id, service, resource)
);

create table if not exists public.integration_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  service text not null check (service in ('drive', 'tasks', 'calendar')),
  resource text not null check (resource in ('files', 'tasks', 'events')),
  remote_id text not null check (char_length(remote_id) between 1 and 512),
  etag text,
  remote_updated_at timestamptz,
  local_updated_at timestamptz,
  deleted_at timestamptz,
  normalized_payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (user_id, service, resource, remote_id),
  check (octet_length(normalized_payload::text) <= 1048576)
);

create table if not exists public.integration_conflicts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  service text not null check (service in ('drive', 'tasks', 'calendar')),
  resource text not null check (resource in ('files', 'tasks', 'events')),
  remote_id text not null check (char_length(remote_id) between 1 and 512),
  base_etag text,
  local_snapshot jsonb not null,
  remote_snapshot jsonb not null,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text check (resolution is null or resolution in ('local', 'remote', 'merged'))
);

create table if not exists public.integration_mutations (
  user_id uuid not null references auth.users(id) on delete cascade,
  mutation_id uuid not null,
  service text not null check (service in ('drive', 'tasks', 'calendar')),
  resource text not null check (resource in ('files', 'tasks', 'events')),
  remote_id text,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, mutation_id)
);

create table if not exists public.integration_ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  requests integer not null default 0 check (requests between 0 and 10),
  primary key (user_id, usage_date)
);

create index if not exists oauth_connections_user_status_idx
  on public.oauth_connections (user_id, service, status);
create index if not exists oauth_pending_expiry_idx
  on public.oauth_pending (expires_at);
create index if not exists integration_items_owner_updated_idx
  on public.integration_items (user_id, service, resource, remote_updated_at desc);
create index if not exists integration_conflicts_unresolved_idx
  on public.integration_conflicts (user_id, detected_at desc)
  where resolved_at is null;

alter table public.oauth_connections enable row level security;
alter table public.oauth_pending enable row level security;
alter table public.integration_sync_state enable row level security;
alter table public.integration_items enable row level security;
alter table public.integration_conflicts enable row level security;
alter table public.integration_mutations enable row level security;
alter table public.integration_ai_usage enable row level security;

revoke all on table
  public.oauth_connections,
  public.oauth_pending,
  public.integration_sync_state,
  public.integration_items,
  public.integration_conflicts,
  public.integration_mutations,
  public.integration_ai_usage
from anon, authenticated;

grant all on table
  public.oauth_connections,
  public.oauth_pending,
  public.integration_sync_state,
  public.integration_items,
  public.integration_conflicts,
  public.integration_mutations,
  public.integration_ai_usage
to service_role;

create or replace function public.consume_cloud_ai_quota(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception 'user_id is required';
  end if;
  insert into public.integration_ai_usage (user_id, usage_date, requests)
  values (p_user_id, current_date, 1)
  on conflict (user_id, usage_date) do update
    set requests = public.integration_ai_usage.requests + 1
    where public.integration_ai_usage.requests < 10;
  return found;
end
$$;

revoke all on function public.consume_cloud_ai_quota(uuid) from public, anon, authenticated;
grant execute on function public.consume_cloud_ai_quota(uuid) to service_role;

create or replace function public.cleanup_expired_oauth_pending()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  delete from public.oauth_pending where expires_at < now();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end
$$;

revoke all on function public.cleanup_expired_oauth_pending() from public, anon, authenticated;
grant execute on function public.cleanup_expired_oauth_pending() to service_role;
