create or replace function public.student_roster_teacher_candidates(p_tenant_id text)
returns table (id uuid, nama text, role text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text := public.current_app_role();
begin
  if auth.uid() is null
    or not public.current_user_is_active()
    or actor_role not in ('admin', 'admin_sekolah', 'operator', 'superadmin') then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  if p_tenant_id is null
    or p_tenant_id = ''
    or (
      actor_role <> 'superadmin'
      and p_tenant_id <> public.current_tenant_id()
    ) then
    raise exception using errcode = '42501', message = 'tenant-forbidden';
  end if;

  if not exists (
    select 1
    from public.tenants as tenant
    where tenant.id = p_tenant_id
      and tenant.active = true
  ) then
    raise exception using errcode = 'P0002', message = 'active-tenant-not-found';
  end if;

  return query
    select profile.id, profile.nama, profile.role
    from public.profiles as profile
    where profile.tenant_id = p_tenant_id
      and profile.active = true
      and profile.role in (
        'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
      )
    order by profile.nama;
end;
$$;

revoke all on function public.student_roster_teacher_candidates(text)
  from public, anon, authenticated;
grant execute on function public.student_roster_teacher_candidates(text)
  to authenticated;

drop policy if exists "School managers read tenant student rosters"
  on public.students;
create policy "School managers read tenant student rosters"
  on public.students
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = students.tenant_id
        and tenant.active = true
    )
    and (
      (select public.current_app_role()) = 'superadmin'
      or (
        (select public.current_app_role()) in ('admin', 'admin_sekolah', 'operator')
        and tenant_id = (select public.current_tenant_id())
      )
    )
  );

drop policy if exists "School managers assign rosters to active teachers"
  on public.students;
create policy "School managers assign rosters to active teachers"
  on public.students
  for insert
  to authenticated
  with check (
    (select public.current_user_is_active())
    and (select public.current_app_role()) in (
      'admin', 'admin_sekolah', 'operator', 'superadmin'
    )
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = students.tenant_id
        and tenant.active = true
    )
    and (
      (select public.current_app_role()) = 'superadmin'
      or tenant_id = (select public.current_tenant_id())
    )
    and exists (
      select 1
      from public.profiles as teacher
      where teacher.id = students.owner_id
        and teacher.tenant_id = students.tenant_id
        and teacher.active = true
        and teacher.role in (
          'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
        )
    )
    and exists (
      select 1
      from public.tenant_entitlements as entitlement
      where entitlement.tenant_id = students.tenant_id
        and entitlement.status in ('trial', 'active')
        and (entitlement.valid_until is null or entitlement.valid_until > now())
    )
  );

drop policy if exists "School managers update tenant student rosters"
  on public.students;
create policy "School managers update tenant student rosters"
  on public.students
  for update
  to authenticated
  using (
    (select public.current_user_is_active())
    and (select public.current_app_role()) in (
      'admin', 'admin_sekolah', 'operator', 'superadmin'
    )
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = students.tenant_id
        and tenant.active = true
    )
    and (
      (select public.current_app_role()) = 'superadmin'
      or tenant_id = (select public.current_tenant_id())
    )
    and exists (
      select 1
      from public.tenant_entitlements as entitlement
      where entitlement.tenant_id = students.tenant_id
        and entitlement.status in ('trial', 'active')
        and (entitlement.valid_until is null or entitlement.valid_until > now())
    )
  )
  with check (
    (select public.current_user_is_active())
    and (select public.current_app_role()) in (
      'admin', 'admin_sekolah', 'operator', 'superadmin'
    )
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = students.tenant_id
        and tenant.active = true
    )
    and (
      (select public.current_app_role()) = 'superadmin'
      or tenant_id = (select public.current_tenant_id())
    )
  );

drop policy if exists "School managers delete tenant student rosters"
  on public.students;
create policy "School managers delete tenant student rosters"
  on public.students
  for delete
  to authenticated
  using (
    (select public.current_user_is_active())
    and (select public.current_app_role()) in (
      'admin', 'admin_sekolah', 'operator', 'superadmin'
    )
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = students.tenant_id
        and tenant.active = true
    )
    and (
      (select public.current_app_role()) = 'superadmin'
      or tenant_id = (select public.current_tenant_id())
    )
    and exists (
      select 1
      from public.tenant_entitlements as entitlement
      where entitlement.tenant_id = students.tenant_id
        and entitlement.status in ('trial', 'active')
        and (entitlement.valid_until is null or entitlement.valid_until > now())
    )
  );
