create table if not exists public.school_announcements (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete restrict,
  author_id uuid not null references auth.users(id) on delete restrict,
  title text not null check (
    char_length(title) between 1 and 200
    and title = btrim(title)
  ),
  body text not null check (
    char_length(body) between 1 and 5000
    and body = btrim(body)
  ),
  created_at timestamptz not null default now()
);

create index if not exists school_announcements_tenant_created_idx
  on public.school_announcements (tenant_id, created_at desc, id);

alter table public.school_announcements enable row level security;

revoke all on table public.school_announcements from public, anon, authenticated;
grant select, delete on table public.school_announcements to authenticated;
grant insert (tenant_id, author_id, title, body)
  on table public.school_announcements to authenticated;
grant update (title, body)
  on table public.school_announcements to authenticated;
grant all on table public.school_announcements to service_role;

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
          'admin_sekolah', 'operator', 'guru', 'siswa', 'ortu', 'orang_tua', 'demo'
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
    and (select public.current_app_role()) in ('admin_sekolah', 'operator')
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
    and (select public.current_app_role()) in ('admin_sekolah', 'operator')
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
    and (select public.current_app_role()) in ('admin_sekolah', 'operator')
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
    and (select public.current_app_role()) in ('admin_sekolah', 'operator')
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = school_announcements.tenant_id
        and tenant.active = true
    )
  );
