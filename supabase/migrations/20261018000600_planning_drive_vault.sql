-- Publish only public encryption keys so package owners can explicitly grant
-- end-to-end encrypted planning access to an active school administrator.
drop policy if exists "Active users read their own public encryption key"
  on public.user_encryption_keys;
create policy "Active tenant users read public encryption keys"
  on public.user_encryption_keys
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and exists (
      select 1
      from public.profiles as requester
      join public.profiles as key_owner
        on key_owner.id = user_encryption_keys.user_id
      where requester.id = (select auth.uid())
        and requester.active
        and key_owner.active
        and requester.tenant_id = key_owner.tenant_id
        and requester.tenant_id = (select public.current_tenant_id())
        and requester.role in ('guru', 'admin_sekolah', 'operator')
        and key_owner.role in ('guru', 'admin_sekolah', 'operator')
    )
  );

drop policy if exists "Active users register their own public encryption key"
  on public.user_encryption_keys;
create policy "Active users register their own public encryption key"
  on public.user_encryption_keys
  for insert
  to authenticated
  with check (
    (select public.current_user_is_active())
    and user_id = (select auth.uid())
  );

drop policy if exists "Active users rotate their own public encryption key"
  on public.user_encryption_keys;
create policy "Active users rotate their own public encryption key"
  on public.user_encryption_keys
  for update
  to authenticated
  using (
    (select public.current_user_is_active())
    and user_id = (select auth.uid())
  )
  with check (
    (select public.current_user_is_active())
    and user_id = (select auth.uid())
  );

grant insert, update on table public.user_encryption_keys to authenticated;

drop policy if exists "Active teachers read same-tenant admin profiles"
  on public.profiles;
create policy "Active teachers read same-tenant admin profiles"
  on public.profiles
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and role = 'admin_sekolah'
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in ('guru', 'operator')
  );
