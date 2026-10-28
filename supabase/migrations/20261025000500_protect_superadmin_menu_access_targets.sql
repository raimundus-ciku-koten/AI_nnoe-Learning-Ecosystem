create or replace function public.set_user_menu_access(
  p_user_id uuid,
  p_disabled_keys text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_role text;
  target_roles text[];
  previous_keys jsonb;
  next_keys jsonb;
  changed boolean := false;
begin
  if actor_id is null
    or not public.current_user_is_active()
    or public.current_app_role() <> 'superadmin' then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  if p_user_id is null
    or p_disabled_keys is null
    or cardinality(p_disabled_keys) > 500
    or exists (
      select 1
      from unnest(p_disabled_keys) as requested(menu_key)
      where requested.menu_key is null
        or char_length(requested.menu_key) not between 7 and 240
        or requested.menu_key !~ '^(group:[a-z0-9][a-z0-9-]*|path:/[a-z0-9][a-z0-9/_-]*)$'
    )
    or cardinality(p_disabled_keys) <> (
      select count(distinct requested.menu_key)
      from unnest(p_disabled_keys) as requested(menu_key)
    ) then
    raise exception using errcode = '22023', message = 'invalid-menu-access';
  end if;

  select role, roles
  into target_role, target_roles
  from public.profiles
  where id = p_user_id
    and active = true
  for update;

  if not found
    or target_role = 'superadmin'
    or 'superadmin' = any(coalesce(target_roles, '{}'::text[])) then
    raise exception using errcode = '22023', message = 'invalid-target-user';
  end if;

  select coalesce(jsonb_agg(menu_key order by menu_key), '[]'::jsonb)
  into previous_keys
  from public.user_menu_access
  where user_id = p_user_id;

  select coalesce(jsonb_agg(key order by key), '[]'::jsonb)
  into next_keys
  from (
    select distinct requested.menu_key as key
    from unnest(p_disabled_keys) as requested(menu_key)
  ) as requested;

  changed := previous_keys is distinct from next_keys;
  if changed then
    delete from public.user_menu_access
    where user_id = p_user_id;

    insert into public.user_menu_access (user_id, menu_key, updated_by)
    select p_user_id, requested.menu_key, actor_id
    from unnest(p_disabled_keys) as requested(menu_key);

    insert into public.platform_audit (
      actor_id, action, target, before_value, after_value
    )
    values (
      actor_id,
      'platform.user_menu_access.updated',
      p_user_id::text,
      previous_keys,
      next_keys
    );
  end if;

  return jsonb_build_object(
    'changed', changed,
    'userId', p_user_id,
    'disabledKeys', next_keys
  );
end;
$$;

revoke all on function public.set_user_menu_access(uuid, text[])
  from public, anon;
grant execute on function public.set_user_menu_access(uuid, text[])
  to authenticated;
