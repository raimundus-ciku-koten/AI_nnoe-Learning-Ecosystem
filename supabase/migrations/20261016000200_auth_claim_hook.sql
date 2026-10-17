-- Add trusted application claims to Supabase Auth access tokens.
-- Configure public.custom_access_token_hook as the Custom Access Token Hook
-- in Authentication > Hooks after applying this migration.

create or replace function public.current_user_is_active()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'active')::boolean, false)
$$;

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
  app_profile public.profiles%rowtype;
begin
  select *
  into app_profile
  from public.profiles
  where id = (event ->> 'user_id')::uuid;

  claims := event -> 'claims';
  app_metadata := coalesce(claims -> 'app_metadata', '{}'::jsonb)
    || jsonb_build_object(
      'role', coalesce(app_profile.role, 'unprovisioned'),
      'tenant_id', coalesce(app_profile.tenant_id, ''),
      'active', coalesce(app_profile.active, false)
    );

  claims := jsonb_set(claims, '{app_metadata}', app_metadata, true);
  return jsonb_set(event, '{claims}', claims, true);
end;
$$;

revoke all on function public.current_user_is_active() from public, anon;
grant execute on function public.current_user_is_active() to authenticated;

revoke all on function public.custom_access_token_hook(jsonb)
  from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant select on table public.profiles to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb)
  to supabase_auth_admin;

drop policy if exists "Members read their tenant" on public.tenants;
create policy "Members read their tenant"
  on public.tenants
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and (
      id = (select public.current_tenant_id())
      or (select public.current_app_role()) = 'superadmin'
    )
  );

drop policy if exists "Users read permitted profiles" on public.profiles;
create policy "Users read permitted profiles"
  on public.profiles
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or (
      (select public.current_user_is_active())
      and (
        (select public.current_app_role()) = 'superadmin'
        or (
          (select public.current_app_role()) = 'admin_sekolah'
          and tenant_id = (select public.current_tenant_id())
        )
      )
    )
  );

drop policy if exists "Users update their own editable profile fields" on public.profiles;
create policy "Users update their own editable profile fields"
  on public.profiles
  for update
  to authenticated
  using (
    id = (select auth.uid())
    and (select public.current_user_is_active())
  )
  with check (
    id = (select auth.uid())
    and (select public.current_user_is_active())
  );
