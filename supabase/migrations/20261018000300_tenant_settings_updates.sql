grant update (
  name,
  education_level,
  npsn,
  headmaster_name,
  headmaster_nip,
  academic_year,
  semester,
  updated_by
) on table public.tenants to authenticated;

drop policy if exists "Active tenant admins update tenant settings"
  on public.tenants;
create policy "Active tenant admins update tenant settings"
  on public.tenants
  for update
  to authenticated
  using (
    (select public.current_user_is_active())
    and active = true
    and (
      (select public.current_app_role()) = 'superadmin'
      or (
        (select public.current_app_role()) = 'admin_sekolah'
        and id = (select public.current_tenant_id())
      )
    )
  )
  with check (
    (select public.current_user_is_active())
    and active = true
    and updated_by = (select auth.uid())
    and (
      (select public.current_app_role()) = 'superadmin'
      or (
        (select public.current_app_role()) = 'admin_sekolah'
        and id = (select public.current_tenant_id())
      )
    )
  );
