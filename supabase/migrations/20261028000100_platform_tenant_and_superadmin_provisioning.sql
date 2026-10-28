create or replace function public.create_platform_tenant(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_name text := btrim(coalesce(p_name, ''));
  tenant_id text := 'tenant-' || gen_random_uuid()::text;
begin
  if actor_id is null
    or not public.current_user_is_active()
    or public.current_app_role() <> 'superadmin' then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  if char_length(normalized_name) not between 2 and 160
    or normalized_name ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'invalid-tenant-name';
  end if;

  insert into public.tenants (id, name, active)
  values (tenant_id, normalized_name, true);

  insert into public.platform_audit (
    actor_id, action, target, before_value, after_value
  )
  values (
    actor_id,
    'platform.tenant.created',
    tenant_id,
    null,
    jsonb_build_object('name', normalized_name, 'active', true)
  );

  return jsonb_build_object('id', tenant_id, 'name', normalized_name);
end;
$$;

revoke all on function public.create_platform_tenant(text) from public, anon;
grant execute on function public.create_platform_tenant(text) to authenticated;

create or replace function public.provision_platform_superadmin(
  p_email text,
  p_nama text
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
  target_user_id uuid;
  actor_email text;
  previous_profile jsonb;
  next_profile jsonb;
  recent_totp_at bigint;
begin
  if actor_id is null
    or not public.current_user_is_active()
    or public.current_app_role() <> 'superadmin' then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  select max(nullif(factor ->> 'timestamp', '')::bigint)
  into recent_totp_at
  from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) as factor
  where factor ->> 'method' = 'totp';

  if auth.jwt() ->> 'aal' <> 'aal2'
    or coalesce(recent_totp_at, 0) < extract(epoch from now())::bigint - 600 then
    raise exception using errcode = '42501', message = 'mfa-step-up-required';
  end if;

  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or char_length(normalized_email) > 254
    or char_length(normalized_name) not between 2 and 120
    or normalized_name ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'invalid-argument';
  end if;

  select lower(btrim(email))
  into actor_email
  from auth.users
  where id = actor_id;

  if normalized_email = actor_email then
    raise exception using errcode = '42501', message = 'cannot-promote-self';
  end if;

  if exists (
    select 1
    from public.profiles
    where lower(btrim(email)) = normalized_email
      and role = 'superadmin'
  ) then
    raise exception using errcode = '23505', message = 'superadmin-already-exists';
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

  insert into public.user_allowlist (
    email, role, roles, tenant_id, active
  )
  values (
    normalized_email, 'superadmin', array['superadmin']::text[], null, true
  )
  on conflict (email) do update
  set role = excluded.role,
      roles = excluded.roles,
      tenant_id = excluded.tenant_id,
      active = excluded.active;

  if target_user_id is not null then
    insert into public.profiles (
      id, email, nama, role, roles, tenant_id, instansi, active
    )
    values (
      target_user_id,
      normalized_email,
      normalized_name,
      'superadmin',
      array['superadmin']::text[],
      null,
      null,
      true
    )
    on conflict (id) do update
    set email = excluded.email,
        nama = excluded.nama,
        role = excluded.role,
        roles = excluded.roles,
        tenant_id = null,
        instansi = null,
        active = true;
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
    'platform.superadmin.provisioned',
    normalized_email,
    previous_profile,
    coalesce(
      next_profile,
      jsonb_build_object(
        'email', normalized_email,
        'nama', normalized_name,
        'role', 'superadmin',
        'roles', jsonb_build_array('superadmin'),
        'active', true,
        'invitation_required', true
      )
    )
  );

  return jsonb_build_object(
    'email', normalized_email,
    'role', 'superadmin',
    'user_id', target_user_id,
    'active', target_user_id is not null,
    'invitation_required', target_user_id is null
  );
end;
$$;

revoke all on function public.provision_platform_superadmin(text, text)
  from public, anon;
grant execute on function public.provision_platform_superadmin(text, text)
  to authenticated;
