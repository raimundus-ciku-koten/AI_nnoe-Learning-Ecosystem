create table if not exists public.trial_registrations (
  email text primary key
    check (email = lower(btrim(email)) and char_length(email) between 3 and 320),
  user_id uuid unique references auth.users(id) on delete set null,
  tenant_id text unique references public.tenants(id) on delete restrict,
  started_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (expires_at = started_at + interval '72 hours')
);

alter table public.profiles
  add column if not exists trial_expires_at timestamptz;

alter table public.user_allowlist
  drop constraint if exists user_allowlist_demo_role_isolated;
alter table public.user_allowlist
  add constraint user_allowlist_demo_role_isolated
  check (
    (role = 'demo' and roles = array['demo']::text[])
    or (role <> 'demo' and not ('demo' = any (roles)))
  );

alter table public.profiles
  drop constraint if exists profiles_demo_role_isolated;
alter table public.profiles
  add constraint profiles_demo_role_isolated
  check (
    (role = 'demo' and roles = array['demo']::text[])
    or (role <> 'demo' and not ('demo' = any (roles)))
  );

alter table public.trial_registrations enable row level security;
revoke all on table public.trial_registrations from anon, authenticated;
grant select on table public.trial_registrations to authenticated;
grant all on table public.trial_registrations to service_role;

drop policy if exists "Trial owners read their trial status"
  on public.trial_registrations;
create policy "Trial owners read their trial status"
  on public.trial_registrations
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and started_at <= now()
    and expires_at > now()
  );

create or replace function public.provision_auth_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.user_allowlist%rowtype;
  trial public.trial_registrations%rowtype;
  display_name text;
  institution_name text := '';
  assigned_roles text[] := '{}';
  assigned_role text := 'unprovisioned';
  assigned_tenant text;
  trial_expiry timestamptz;
  account_active boolean := false;
  normalized_email text := lower(btrim(coalesce(new.email, '')));
begin
  select *
  into invitation
  from public.user_allowlist
  where email = normalized_email;

  display_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Pengguna'
  );

  if invitation.email is not null and invitation.active then
    assigned_role := invitation.role;
    assigned_roles := coalesce(nullif(invitation.roles, '{}'::text[]), array[invitation.role]);
    assigned_tenant := invitation.tenant_id;
    account_active := invitation.active and new.email_confirmed_at is not null;

    if assigned_tenant is not null then
      select name
      into institution_name
      from public.tenants
      where id = assigned_tenant;
    end if;
  elsif new.email_confirmed_at is not null and normalized_email <> '' then
    select *
    into trial
    from public.trial_registrations
    where user_id = new.id;

    if not found then
      insert into public.trial_registrations (
        email, user_id, started_at, expires_at
      )
      values (
        normalized_email,
        new.id,
        now(),
        now() + interval '72 hours'
      )
      on conflict (email) do nothing
      returning * into trial;

      if trial.user_id = new.id then
        assigned_tenant := 'trial-' || new.id::text;
        insert into public.tenants (id, name, active)
        values (assigned_tenant, 'AI_nnoe Trial ' || left(new.id::text, 8), true);
        update public.trial_registrations
        set tenant_id = assigned_tenant
        where email = normalized_email
        returning * into trial;
      end if;
    end if;

    if trial.user_id = new.id and trial.tenant_id is not null then
      assigned_role := 'demo';
      assigned_roles := array['demo'];
      assigned_tenant := trial.tenant_id;
      trial_expiry := trial.expires_at;
      account_active := trial.started_at <= now() and trial.expires_at > now();
      institution_name := 'AI_nnoe Demo';
    end if;
  end if;

  insert into public.profiles (
    id, email, nama, role, roles, tenant_id, instansi, active, trial_expires_at
  )
  values (
    new.id,
    nullif(normalized_email, ''),
    left(display_name, 120),
    assigned_role,
    assigned_roles,
    assigned_tenant,
    coalesce(institution_name, ''),
    account_active,
    trial_expiry
  )
  on conflict (id) do update
  set email = excluded.email,
      nama = case
        when public.profiles.role in ('unprovisioned', 'demo') then excluded.nama
        else public.profiles.nama
      end,
      role = excluded.role,
      roles = excluded.roles,
      tenant_id = excluded.tenant_id,
      instansi = excluded.instansi,
      active = excluded.active,
      trial_expires_at = excluded.trial_expires_at;

  return new;
end;
$$;

revoke all on function public.provision_auth_profile()
  from public, anon, authenticated;

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb;
  app_metadata jsonb;
  profile_roles text[];
  selected_role text;
  app_profile public.profiles%rowtype;
  account_active boolean;
begin
  select *
  into app_profile
  from public.profiles
  where id = (event ->> 'user_id')::uuid;

  profile_roles := coalesce(app_profile.roles, '{}'::text[]);
  if cardinality(profile_roles) = 0 and app_profile.role <> 'unprovisioned' then
    profile_roles := array[app_profile.role];
  end if;

  claims := event -> 'claims';
  selected_role := claims -> 'user_metadata' ->> 'active_role';
  if selected_role is null or not (selected_role = any (profile_roles)) then
    selected_role := app_profile.role;
  end if;

  account_active := coalesce(app_profile.active, false)
    and (
      app_profile.role <> 'demo'
      or (
        app_profile.trial_expires_at is not null
        and app_profile.trial_expires_at > now()
      )
    );

  app_metadata := coalesce(claims -> 'app_metadata', '{}'::jsonb)
    || jsonb_build_object(
      'role', coalesce(selected_role, 'unprovisioned'),
      'roles', to_jsonb(profile_roles),
      'tenant_id', coalesce(app_profile.tenant_id, ''),
      'active', account_active,
      'trial_expires_at', app_profile.trial_expires_at
    );

  claims := jsonb_set(claims, '{app_metadata}', app_metadata, true);
  return jsonb_set(event, '{claims}', claims, true);
end;
$$;

revoke all on function public.custom_access_token_hook(jsonb)
  from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant select on table public.profiles to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb)
  to supabase_auth_admin;

create or replace function public.current_user_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select profile.active
      and profile.role <> 'demo'
      and public.current_app_role() in (
        'superadmin', 'admin_sekolah', 'operator', 'guru', 'siswa',
        'ortu', 'orang_tua'
      )
      and case
        when public.current_app_role() in ('admin_sekolah', 'superadmin')
          then auth.jwt() ->> 'aal' = 'aal2'
        else true
      end
    from public.profiles as profile
    where profile.id = auth.uid()
  ), false)
$$;

revoke all on function public.current_user_is_active() from public, anon;
grant execute on function public.current_user_is_active() to authenticated;

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when auth.jwt() -> 'app_metadata' ->> 'role'
        in ('guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler')
        then 'guru'
      else auth.jwt() -> 'app_metadata' ->> 'role'
    end
    from public.profiles as profile
    where profile.id = auth.uid()
      and profile.active
      and profile.role <> 'demo'
      and auth.jwt() -> 'app_metadata' ->> 'role' = any (
        case
          when cardinality(profile.roles) > 0 then profile.roles
          when profile.role <> 'unprovisioned' then array[profile.role]
          else '{}'::text[]
        end
      )
  ), '')
$$;

revoke all on function public.current_app_role() from public, anon;
grant execute on function public.current_app_role() to authenticated;

create or replace function public.current_tenant_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case when profile.role = 'demo' then '' else profile.tenant_id end
    from public.profiles as profile
    where profile.id = auth.uid()
      and profile.active
  ), '')
$$;

revoke all on function public.current_tenant_id() from public, anon;
grant execute on function public.current_tenant_id() to authenticated;
