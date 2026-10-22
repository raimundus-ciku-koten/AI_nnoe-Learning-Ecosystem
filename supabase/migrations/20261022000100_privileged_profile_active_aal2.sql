-- Keep privileged access tied to the current active profile and a fresh AAL2 JWT.

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
