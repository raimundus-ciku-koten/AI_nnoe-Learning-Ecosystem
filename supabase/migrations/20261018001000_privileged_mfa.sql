-- Require an AAL2 Supabase Auth session for privileged database access.
-- The browser gate enrolls administrators in TOTP; this database guard is the
-- authorization boundary and cannot be bypassed by skipping the UI.

create or replace function public.current_user_is_active()
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    coalesce((auth.jwt() -> 'app_metadata' ->> 'active')::boolean, false)
    and case
      when public.current_app_role() in ('admin_sekolah', 'superadmin')
        then auth.jwt() ->> 'aal' = 'aal2'
      else true
    end
$$;

revoke all on function public.current_user_is_active() from public, anon;
grant execute on function public.current_user_is_active() to authenticated;
