create table if not exists public.platform_user_menu_overrides (
  user_id uuid not null references public.profiles(id) on delete cascade,
  menu_key text not null check (char_length(menu_key) between 5 and 240),
  enabled boolean not null default false check (enabled = false),
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  primary key (user_id, menu_key)
);

alter table public.platform_user_menu_overrides enable row level security;
revoke all on table public.platform_user_menu_overrides from public, anon, authenticated;
grant all on table public.platform_user_menu_overrides to service_role;

create or replace function public.current_user_disabled_menu_keys()
returns table (menu_key text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (select public.current_user_is_active()) then
    raise exception 'Pengguna aktif diperlukan untuk membaca konfigurasi menu.'
      using errcode = '42501';
  end if;

  return query
  select override.menu_key
  from public.platform_user_menu_overrides as override
  where override.user_id = auth.uid()
    and override.enabled = false;
end;
$$;

create or replace function public.platform_user_menu_overrides(p_user_id uuid)
returns table (menu_key text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'superadmin' then
    raise exception 'Superadmin aktif diperlukan untuk mengelola menu pengguna.'
      using errcode = '42501';
  end if;

  if p_user_id is null or not exists (
    select 1 from public.profiles as profile
    where profile.id = p_user_id and profile.role <> 'superadmin'
  ) then
    raise exception 'Pengguna target tidak valid untuk pengaturan menu.'
      using errcode = '22023';
  end if;

  return query
  select override.menu_key
  from public.platform_user_menu_overrides as override
  where override.user_id = p_user_id
    and override.enabled = false;
end;
$$;

create or replace function public.set_platform_user_disabled_menus(
  p_user_id uuid,
  p_disabled_menu_keys text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  previous_keys text[];
  next_keys text[];
  profile_tenant text;
  changed boolean;
begin
  if actor_id is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'superadmin' then
    raise exception 'Superadmin aktif diperlukan untuk mengubah menu pengguna.'
      using errcode = '42501';
  end if;

  if p_user_id is null
    or p_disabled_menu_keys is null
    or cardinality(p_disabled_menu_keys) > 200
    or exists (
      select 1 from unnest(p_disabled_menu_keys) as key(value)
      where value is null
        or char_length(value) not between 5 and 240
        or value !~ '^[a-z0-9-]+\|/[a-z0-9/_-]+(\?[a-zA-Z0-9_=&%-]+)?$'
        or value ~ '\|/dashboard(\?|$)'
    ) then
    raise exception 'Daftar menu nonaktif tidak valid.'
      using errcode = '22023';
  end if;

  select profile.tenant_id
    into profile_tenant
  from public.profiles as profile
  where profile.id = p_user_id
    and profile.role <> 'superadmin'
  for update;

  if not found then
    raise exception 'Pengguna target tidak ditemukan atau tidak dapat dikelola.'
      using errcode = '22023';
  end if;

  if public.text_array_has_unique_values(p_disabled_menu_keys) is not true then
    raise exception 'Daftar menu tidak boleh berisi duplikat.'
      using errcode = '22023';
  end if;

  select coalesce(array_agg(override.menu_key order by override.menu_key), '{}'::text[])
    into previous_keys
  from public.platform_user_menu_overrides as override
  where override.user_id = p_user_id
    and override.enabled = false;

  select coalesce(array_agg(key.value order by key.value), '{}'::text[])
    into next_keys
  from unnest(p_disabled_menu_keys) as key(value);

  changed := previous_keys is distinct from next_keys;
  if changed then
    delete from public.platform_user_menu_overrides
    where user_id = p_user_id;

    insert into public.platform_user_menu_overrides (
      user_id, menu_key, enabled, updated_by
    )
    select p_user_id, key.value, false, actor_id
    from unnest(next_keys) as key(value);

    insert into public.platform_audit (
      actor_id, action, target, before_value, after_value
    )
    values (
      actor_id,
      'platform.user.menus.updated',
      p_user_id::text,
      jsonb_build_object('tenant_id', profile_tenant, 'disabled_menu_keys', to_jsonb(previous_keys)),
      jsonb_build_object('tenant_id', profile_tenant, 'disabled_menu_keys', to_jsonb(next_keys))
    );
  end if;

  return jsonb_build_object(
    'changed', changed,
    'disabled_menu_keys', to_jsonb(next_keys)
  );
end;
$$;

create or replace function public.create_platform_tenant(
  p_tenant_id text,
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_id text := lower(btrim(coalesce(p_tenant_id, '')));
  normalized_name text := btrim(coalesce(p_name, ''));
begin
  if actor_id is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'superadmin' then
    raise exception 'Superadmin aktif diperlukan untuk membuat tenant.'
      using errcode = '42501';
  end if;

  if normalized_id !~ '^[a-z0-9]+([a-z0-9-]{0,78}[a-z0-9])?$'
    or char_length(normalized_id) not between 3 and 80
    or char_length(normalized_name) not between 2 and 160
    or normalized_name ~ '[[:cntrl:]]' then
    raise exception 'ID atau nama tenant tidak valid.'
      using errcode = '22023';
  end if;

  insert into public.tenants (id, name, active)
  values (normalized_id, normalized_name, true);

  insert into public.platform_audit (
    actor_id, action, target, before_value, after_value
  )
  values (
    actor_id,
    'platform.tenant.created',
    normalized_id,
    null,
    jsonb_build_object('name', normalized_name, 'active', true)
  );

  return jsonb_build_object(
    'tenant_id', normalized_id,
    'name', normalized_name,
    'active', true
  );
end;
$$;

revoke all on function public.current_user_disabled_menu_keys()
  from public, anon;
revoke all on function public.platform_user_menu_overrides(uuid)
  from public, anon;
revoke all on function public.set_platform_user_disabled_menus(uuid, text[])
  from public, anon;
revoke all on function public.create_platform_tenant(text, text)
  from public, anon;

grant execute on function public.current_user_disabled_menu_keys()
  to authenticated;
grant execute on function public.platform_user_menu_overrides(uuid)
  to authenticated;
grant execute on function public.set_platform_user_disabled_menus(uuid, text[])
  to authenticated;
grant execute on function public.create_platform_tenant(text, text)
  to authenticated;
