-- Add trusted, same-tenant role assignments. User-editable metadata is only
-- treated as a role preference after the access-token hook validates it.

alter table public.user_allowlist
  drop constraint if exists user_allowlist_role_check;
alter table public.user_allowlist
  add constraint user_allowlist_role_check
  check (role in (
    'superadmin', 'admin_sekolah', 'operator', 'guru', 'siswa', 'ortu',
    'orang_tua', 'demo', 'kepala_sekolah', 'wali_kelas', 'guru_bk',
    'guru_kokurikuler', 'guru_ekstrakurikuler'
  ));

alter table public.profiles
  drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in (
    'unprovisioned', 'superadmin', 'admin_sekolah', 'operator', 'guru',
    'siswa', 'ortu', 'orang_tua', 'demo', 'kepala_sekolah', 'wali_kelas',
    'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
  ));

alter table public.user_allowlist
  add column if not exists roles text[] not null default '{}';
alter table public.profiles
  add column if not exists roles text[] not null default '{}';

update public.user_allowlist
set roles = array[role]
where cardinality(roles) = 0;

update public.profiles
set roles = array[role]
where cardinality(roles) = 0
  and role <> 'unprovisioned';

create or replace function public.text_array_has_unique_values(values_to_check text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(values_to_check) = count(distinct assigned_value)
  from unnest(values_to_check) as assigned_value
$$;

alter table public.user_allowlist
  add constraint user_allowlist_roles_valid
  check (
    cardinality(roles) between 1 and 8
    and array_position(roles, null::text) is null
    and role = any (roles)
    and roles <@ array[
      'superadmin', 'admin_sekolah', 'operator', 'guru', 'siswa', 'ortu',
      'orang_tua', 'demo', 'kepala_sekolah', 'wali_kelas', 'guru_bk',
      'guru_kokurikuler', 'guru_ekstrakurikuler'
    ]::text[]
    and public.text_array_has_unique_values(roles)
    and (not ('superadmin' = any (roles)) or cardinality(roles) = 1)
    and (not (roles && array['wali_kelas', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler']::text[])
      or 'guru' = any (roles))
  );

alter table public.profiles
  add constraint profiles_roles_valid
  check (
    (role = 'unprovisioned' and cardinality(roles) = 0)
    or (
      role <> 'unprovisioned'
      and cardinality(roles) between 1 and 8
      and array_position(roles, null::text) is null
      and role = any (roles)
      and roles <@ array[
        'superadmin', 'admin_sekolah', 'operator', 'guru', 'siswa', 'ortu',
        'orang_tua', 'demo', 'kepala_sekolah', 'wali_kelas', 'guru_bk',
        'guru_kokurikuler', 'guru_ekstrakurikuler'
      ]::text[]
      and public.text_array_has_unique_values(roles)
      and (not ('superadmin' = any (roles)) or cardinality(roles) = 1)
      and (not (roles && array['wali_kelas', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler']::text[])
        or 'guru' = any (roles))
    )
  );

create or replace function public.provision_auth_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.user_allowlist%rowtype;
  display_name text;
  institution_name text := '';
  assigned_roles text[] := '{}';
begin
  select *
  into invitation
  from public.user_allowlist
  where email = lower(btrim(new.email))
    and active = true;

  if invitation.tenant_id is not null then
    select name
    into institution_name
    from public.tenants
    where id = invitation.tenant_id;
  end if;

  if invitation.email is not null then
    assigned_roles := invitation.roles;
    if cardinality(assigned_roles) = 0 then
      assigned_roles := array[invitation.role];
    end if;
  end if;

  display_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Pengguna'
  );

  insert into public.profiles (
    id, email, nama, role, roles, tenant_id, instansi, active
  )
  values (
    new.id,
    nullif(lower(btrim(new.email)), ''),
    left(display_name, 120),
    coalesce(invitation.role, 'unprovisioned'),
    assigned_roles,
    invitation.tenant_id,
    coalesce(institution_name, ''),
    coalesce(invitation.active, false) and new.email_confirmed_at is not null
  )
  on conflict (id) do update
  set email = excluded.email,
      nama = case
        when public.profiles.role = 'unprovisioned' then excluded.nama
        else public.profiles.nama
      end,
      role = excluded.role,
      roles = excluded.roles,
      tenant_id = excluded.tenant_id,
      instansi = excluded.instansi,
      active = excluded.active;

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

  app_metadata := coalesce(claims -> 'app_metadata', '{}'::jsonb)
    || jsonb_build_object(
      'role', coalesce(selected_role, 'unprovisioned'),
      'roles', to_jsonb(profile_roles),
      'tenant_id', coalesce(app_profile.tenant_id, ''),
      'active', coalesce(app_profile.active, false)
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
    from public.profiles as profile
    where profile.id = auth.uid()
      and public.current_app_role() in (
        'superadmin', 'admin_sekolah', 'operator', 'guru', 'siswa',
        'ortu', 'orang_tua', 'demo'
      )
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

drop function public.manage_platform_user(
  text, text, text, text, boolean, text, text[], text[]
);

create function public.manage_platform_user(
  p_email text,
  p_nama text,
  p_role text,
  p_tenant_id text,
  p_active boolean,
  p_nip text default null,
  p_mapel_ids text[] default '{}',
  p_kelas_ids text[] default '{}',
  p_roles text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_email text := lower(btrim(coalesce(p_email, '')));
  normalized_name text := btrim(coalesce(p_nama, ''));
  normalized_nip text := nullif(btrim(coalesce(p_nip, '')), '');
  assigned_roles text[] := coalesce(p_roles, array[p_role]);
  tenant_name text;
  target_user_id uuid;
  previous_profile jsonb;
  next_profile jsonb;
begin
  if actor_id is null
    or not public.current_user_is_active()
    or public.current_app_role() <> 'superadmin' then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or char_length(normalized_email) > 254
    or char_length(normalized_name) not between 2 and 120
    or normalized_name ~ '[[:cntrl:]]'
    or p_role is null
    or p_role not in (
      'admin_sekolah', 'operator', 'guru', 'siswa', 'ortu', 'orang_tua',
      'kepala_sekolah', 'wali_kelas', 'guru_bk', 'guru_kokurikuler',
      'guru_ekstrakurikuler'
    )
    or p_active is null
    or assigned_roles is null
    or cardinality(assigned_roles) not between 1 and 8
    or p_role <> all (assigned_roles)
    or assigned_roles && array['superadmin', 'unprovisioned']::text[]
    or not (assigned_roles <@ array[
      'admin_sekolah', 'operator', 'guru', 'siswa', 'ortu', 'orang_tua',
      'kepala_sekolah', 'wali_kelas', 'guru_bk', 'guru_kokurikuler',
      'guru_ekstrakurikuler'
    ]::text[])
    or array_position(assigned_roles, null) is not null
    or not public.text_array_has_unique_values(assigned_roles)
    or (
      assigned_roles && array[
        'wali_kelas', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
      ]::text[]
      and not ('guru' = any (assigned_roles))
    )
    or p_mapel_ids is null
    or p_kelas_ids is null
    or cardinality(p_mapel_ids) > 30
    or cardinality(p_kelas_ids) > 30
    or exists (
      select 1 from unnest(p_mapel_ids || p_kelas_ids) as item
      where item is null
        or char_length(btrim(item)) not between 1 and 120
        or item ~ '[[:cntrl:]]'
    ) then
    raise exception using errcode = '22023', message = 'invalid-argument';
  end if;

  if normalized_nip is not null
    and (char_length(normalized_nip) > 40 or normalized_nip ~ '[[:cntrl:]]') then
    raise exception using errcode = '22023', message = 'invalid-argument';
  end if;

  select name
  into tenant_name
  from public.tenants
  where id = p_tenant_id
    and active = true;

  if tenant_name is null then
    raise exception using errcode = 'P0002', message = 'active-tenant-not-found';
  end if;

  if normalized_email = (
    select lower(btrim(email)) from auth.users where id = actor_id
  ) or exists (
    select 1 from public.profiles
    where email = normalized_email and role = 'superadmin'
  ) then
    raise exception using errcode = '42501', message = 'cannot-change-superadmin';
  end if;

  select id
  into target_user_id
  from auth.users
  where lower(btrim(email)) = normalized_email
    and email_confirmed_at is not null;

  select to_jsonb(profile)
  into previous_profile
  from public.profiles as profile
  where profile.email = normalized_email;

  insert into public.user_allowlist (email, role, roles, tenant_id, active)
  values (normalized_email, p_role, assigned_roles, p_tenant_id, p_active)
  on conflict (email) do update
  set role = excluded.role,
      roles = excluded.roles,
      tenant_id = excluded.tenant_id,
      active = excluded.active;

  if target_user_id is not null then
    insert into public.profiles (
      id, email, nama, role, roles, tenant_id, instansi, nip, mapel_ids,
      kelas_ids, active
    )
    values (
      target_user_id, normalized_email, normalized_name, p_role, assigned_roles,
      p_tenant_id, tenant_name, normalized_nip, p_mapel_ids, p_kelas_ids, p_active
    )
    on conflict (id) do update
    set email = excluded.email,
        nama = excluded.nama,
        role = excluded.role,
        roles = excluded.roles,
        tenant_id = excluded.tenant_id,
        instansi = excluded.instansi,
        nip = excluded.nip,
        mapel_ids = excluded.mapel_ids,
        kelas_ids = excluded.kelas_ids,
        active = excluded.active;
  end if;

  select to_jsonb(profile)
  into next_profile
  from public.profiles as profile
  where profile.email = normalized_email;

  insert into public.platform_audit (
    actor_id, action, target, before_value, after_value
  )
  values (
    actor_id,
    'platform.user.provisioned',
    normalized_email,
    previous_profile,
    coalesce(
      next_profile,
      jsonb_build_object(
        'email', normalized_email,
        'nama', normalized_name,
        'role', p_role,
        'roles', to_jsonb(assigned_roles),
        'tenant_id', p_tenant_id,
        'instansi', tenant_name,
        'active', p_active,
        'invitation_required', true
      )
    )
  );

  return jsonb_build_object(
    'email', normalized_email,
    'role', p_role,
    'roles', to_jsonb(assigned_roles),
    'tenant_id', p_tenant_id,
    'active', p_active and target_user_id is not null,
    'user_id', target_user_id,
    'invitation_required', target_user_id is null
  );
end;
$$;

revoke all on function public.manage_platform_user(
  text, text, text, text, boolean, text, text[], text[], text[]
) from public, anon;
grant execute on function public.manage_platform_user(
  text, text, text, text, boolean, text, text[], text[], text[]
) to authenticated;
