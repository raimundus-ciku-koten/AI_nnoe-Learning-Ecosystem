-- Identity foundation for the staged Firebase-to-Supabase migration.
-- Roles and tenant assignments are provisioned only through trusted SQL/service code.

create table if not exists public.tenants (
  id text primary key,
  name text not null check (char_length(name) between 1 and 160),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_allowlist (
  email text primary key
    check (email = lower(btrim(email)) and char_length(email) between 3 and 320),
  role text not null check (
    role in (
      'superadmin',
      'admin_sekolah',
      'operator',
      'guru',
      'siswa',
      'ortu',
      'orang_tua',
      'demo'
    )
  ),
  tenant_id text references public.tenants(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (role = 'superadmin' or tenant_id is not null)
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  legacy_uid text unique,
  email text check (email is null or (email = lower(btrim(email)) and char_length(email) <= 320)),
  nama text not null default 'Pengguna' check (char_length(nama) between 1 and 120),
  role text not null default 'unprovisioned' check (
    role in (
      'unprovisioned',
      'superadmin',
      'admin_sekolah',
      'operator',
      'guru',
      'siswa',
      'ortu',
      'orang_tua',
      'demo'
    )
  ),
  tenant_id text references public.tenants(id) on delete restrict,
  photo_url text,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (role in ('unprovisioned', 'superadmin') or tenant_id is not null)
);

create or replace function public.current_app_role()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')
$$;

create or replace function public.current_tenant_id()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.user_allowlist%rowtype;
  display_name text;
begin
  select *
  into invitation
  from public.user_allowlist
  where email = lower(btrim(new.email))
    and active = true;

  display_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Pengguna'
  );

  insert into public.profiles (id, email, nama, role, tenant_id, active)
  values (
    new.id,
    nullif(lower(btrim(new.email)), ''),
    left(display_name, 120),
    coalesce(invitation.role, 'unprovisioned'),
    invitation.tenant_id,
    coalesce(invitation.active, false)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists tenants_set_updated_at on public.tenants;
create trigger tenants_set_updated_at
  before update on public.tenants
  for each row execute function public.set_updated_at();

alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.user_allowlist enable row level security;

revoke all on table public.tenants from anon, authenticated;
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.user_allowlist from anon, authenticated;

grant select on table public.tenants to authenticated;
grant select on table public.profiles to authenticated;
grant update (nama, photo_url) on table public.profiles to authenticated;
grant all on table public.tenants, public.profiles, public.user_allowlist to service_role;

revoke all on function public.current_app_role() from public, anon;
revoke all on function public.current_tenant_id() from public, anon;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.current_tenant_id() to authenticated;

drop policy if exists "Members read their tenant" on public.tenants;
create policy "Members read their tenant"
  on public.tenants
  for select
  to authenticated
  using (
    id = (select public.current_tenant_id())
    or (select public.current_app_role()) = 'superadmin'
  );

drop policy if exists "Users read permitted profiles" on public.profiles;
create policy "Users read permitted profiles"
  on public.profiles
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or (select public.current_app_role()) = 'superadmin'
    or (
      (select public.current_app_role()) = 'admin_sekolah'
      and tenant_id = (select public.current_tenant_id())
    )
  );

drop policy if exists "Users update their own editable profile fields" on public.profiles;
create policy "Users update their own editable profile fields"
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
