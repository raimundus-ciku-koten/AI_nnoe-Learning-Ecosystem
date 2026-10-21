-- Allow active superadmins to review pending and provisioned identities.
grant select on table public.user_allowlist to authenticated;

drop policy if exists "Active superadmins read platform allowlist"
  on public.user_allowlist;
create policy "Active superadmins read platform allowlist"
  on public.user_allowlist
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and (select public.current_app_role()) = 'superadmin'
  );
