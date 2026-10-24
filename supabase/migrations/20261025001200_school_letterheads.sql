create table if not exists public.school_letterheads (
  tenant_id text primary key references public.tenants(id) on delete cascade,
  image_data_url text not null check (
    char_length(image_data_url) between 32 and 500000
    and image_data_url ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$'
  ),
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now()
);

drop trigger if exists school_letterheads_set_updated_at on public.school_letterheads;
create trigger school_letterheads_set_updated_at
  before update on public.school_letterheads
  for each row execute function public.set_updated_at();

alter table public.school_letterheads enable row level security;
revoke all on table public.school_letterheads from anon, authenticated;
grant select, insert, update, delete on table public.school_letterheads to authenticated;
grant all on table public.school_letterheads to service_role;

drop policy if exists "Active school staff read letterheads" on public.school_letterheads;
create policy "Active school staff read letterheads"
  on public.school_letterheads
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = school_letterheads.tenant_id
        and tenant.active = true
    )
    and (
      (select public.current_app_role()) = 'superadmin'
      or (
        (select public.current_app_role()) in ('admin', 'admin_sekolah', 'operator', 'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler')
        and tenant_id = (select public.current_tenant_id())
      )
    )
  );

drop policy if exists "Active school staff create letterheads" on public.school_letterheads;
create policy "Active school staff create letterheads"
  on public.school_letterheads
  for insert
  to authenticated
  with check (
    (select public.current_user_is_active())
    and updated_by = (select auth.uid())
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = school_letterheads.tenant_id
        and tenant.active = true
    )
    and (
      (select public.current_app_role()) = 'superadmin'
      or (
        (select public.current_app_role()) in ('admin', 'admin_sekolah', 'operator', 'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler')
        and tenant_id = (select public.current_tenant_id())
      )
    )
  );

drop policy if exists "Active school staff update letterheads" on public.school_letterheads;
create policy "Active school staff update letterheads"
  on public.school_letterheads
  for update
  to authenticated
  using (
    (select public.current_user_is_active())
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = school_letterheads.tenant_id
        and tenant.active = true
    )
    and (
      (select public.current_app_role()) = 'superadmin'
      or (
        (select public.current_app_role()) in ('admin', 'admin_sekolah', 'operator', 'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler')
        and tenant_id = (select public.current_tenant_id())
      )
    )
  )
  with check (
    (select public.current_user_is_active())
    and updated_by = (select auth.uid())
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = school_letterheads.tenant_id
        and tenant.active = true
    )
    and (
      (select public.current_app_role()) = 'superadmin'
      or (
        (select public.current_app_role()) in ('admin', 'admin_sekolah', 'operator', 'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler')
        and tenant_id = (select public.current_tenant_id())
      )
    )
  );

drop policy if exists "Active school staff delete letterheads" on public.school_letterheads;
create policy "Active school staff delete letterheads"
  on public.school_letterheads
  for delete
  to authenticated
  using (
    (select public.current_user_is_active())
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = school_letterheads.tenant_id
        and tenant.active = true
    )
    and (
      (select public.current_app_role()) = 'superadmin'
      or (
        (select public.current_app_role()) in ('admin', 'admin_sekolah', 'operator', 'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler')
        and tenant_id = (select public.current_tenant_id())
      )
    )
  );

drop policy if exists "Superadmins read their active-tenant student roster"
  on public.students;
create policy "Superadmins read active-tenant student rosters"
  on public.students
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and owner_id = (select auth.uid())
    and (select public.current_app_role()) = 'superadmin'
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = students.tenant_id
        and tenant.active = true
    )
  );

drop policy if exists "Superadmins import students into active tenant"
  on public.students;
create policy "Superadmins import students into active tenant"
  on public.students
  for insert
  to authenticated
  with check (
    (select public.current_user_is_active())
    and owner_id = (select auth.uid())
    and (select public.current_app_role()) = 'superadmin'
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = students.tenant_id
        and tenant.active = true
    )
  );

drop policy if exists "School staff roles read their own student roster"
  on public.students;
create policy "School staff roles read their own student roster"
  on public.students
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in ('admin', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler')
    and exists (
    select 1 from public.tenants as tenant
    where tenant.id = students.tenant_id and tenant.active = true
    )
  );

drop policy if exists "School staff roles import their own students"
  on public.students;
create policy "School staff roles import their own students"
  on public.students
  for insert
  to authenticated
  with check (
    (select public.current_user_is_active())
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in ('admin', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler')
    and exists (
    select 1 from public.tenants as tenant
    where tenant.id = students.tenant_id and tenant.active = true
    )
  );
