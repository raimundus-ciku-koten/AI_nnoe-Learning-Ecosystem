drop policy if exists "Active school members and superadmins read announcements"
  on public.school_announcements;
create policy "Active school members and superadmins read announcements"
  on public.school_announcements
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = school_announcements.tenant_id
        and tenant.active = true
    )
    and (
      (select public.current_app_role()) = 'superadmin'
      or (
        school_announcements.tenant_id = (select public.current_tenant_id())
        and (select public.current_app_role()) in (
          'admin', 'admin_sekolah', 'operator',
          'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler',
          'siswa', 'ortu', 'orang_tua'
        )
      )
    )
  );

drop policy if exists "Entitled school staff create announcements"
  on public.school_announcements;
create policy "Entitled school staff create announcements"
  on public.school_announcements
  for insert
  to authenticated
  with check (
    (select public.current_user_is_active())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in ('admin', 'admin_sekolah', 'operator')
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = school_announcements.tenant_id
        and tenant.active = true
    )
    and exists (
      select 1
      from public.tenant_entitlements as entitlement
      where entitlement.tenant_id = school_announcements.tenant_id
        and entitlement.status in ('trial', 'active')
        and (entitlement.valid_until is null or entitlement.valid_until > now())
    )
    and author_id = (select auth.uid())
  );

drop policy if exists "Entitled school staff update announcements"
  on public.school_announcements;
create policy "Entitled school staff update announcements"
  on public.school_announcements
  for update
  to authenticated
  using (
    (select public.current_user_is_active())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in ('admin', 'admin_sekolah', 'operator')
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = school_announcements.tenant_id
        and tenant.active = true
    )
    and exists (
      select 1
      from public.tenant_entitlements as entitlement
      where entitlement.tenant_id = school_announcements.tenant_id
        and entitlement.status in ('trial', 'active')
        and (entitlement.valid_until is null or entitlement.valid_until > now())
    )
  )
  with check (
    (select public.current_user_is_active())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in ('admin', 'admin_sekolah', 'operator')
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = school_announcements.tenant_id
        and tenant.active = true
    )
    and exists (
      select 1
      from public.tenant_entitlements as entitlement
      where entitlement.tenant_id = school_announcements.tenant_id
        and entitlement.status in ('trial', 'active')
        and (entitlement.valid_until is null or entitlement.valid_until > now())
    )
  );

drop policy if exists "School staff delete announcements"
  on public.school_announcements;
create policy "School staff delete announcements"
  on public.school_announcements
  for delete
  to authenticated
  using (
    (select public.current_user_is_active())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in ('admin', 'admin_sekolah', 'operator')
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = school_announcements.tenant_id
        and tenant.active = true
    )
  );
