create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete cascade,
  nama text not null check (
    char_length(nama) between 1 and 100
    and nama = btrim(nama)
    and nama !~ '[[:cntrl:]]'
  ),
  kelas text not null check (
    char_length(kelas) between 1 and 30
    and kelas = btrim(kelas)
    and kelas !~ '[[:cntrl:]]'
  ),
  nisn text check (nisn is null or nisn ~ '^[0-9]{1,20}$'),
  jk text check (jk is null or jk in ('L', 'P')),
  kode_unik text not null unique check (
    kode_unik ~ '^ALE-[A-Z0-9]{1,6}-[A-Z0-9]{6}-[0-9]{4}$'
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists students_owner_nisn_unique
  on public.students (owner_id, nisn)
  where nisn is not null;

create index if not exists students_owner_class_idx
  on public.students (owner_id, kelas, nama);

drop trigger if exists students_set_updated_at on public.students;
create trigger students_set_updated_at
  before update on public.students
  for each row execute function public.set_updated_at();

alter table public.students enable row level security;

revoke all on table public.students from anon, authenticated;
grant select, delete on table public.students to authenticated;
grant insert (tenant_id, owner_id, nama, kelas, nisn, jk, kode_unik)
  on table public.students to authenticated;
grant update (nama, kelas, nisn, jk)
  on table public.students to authenticated;
grant all on table public.students to service_role;

drop policy if exists "Active teachers read their own student roster"
  on public.students;
create policy "Active teachers read their own student roster"
  on public.students
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in ('admin_sekolah', 'operator', 'guru', 'demo')
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = students.tenant_id
        and tenant.active = true
    )
  );

drop policy if exists "Entitled active teachers create their own students"
  on public.students;
create policy "Entitled active teachers create their own students"
  on public.students
  for insert
  to authenticated
  with check (
    (select public.current_user_is_active())
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in ('admin_sekolah', 'operator', 'guru', 'demo')
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = students.tenant_id
        and tenant.active = true
    )
    and exists (
      select 1
      from public.tenant_entitlements as entitlement
      where entitlement.tenant_id = students.tenant_id
        and entitlement.status in ('trial', 'active')
        and (entitlement.valid_until is null or entitlement.valid_until > now())
    )
  );

drop policy if exists "Entitled active teachers update their own students"
  on public.students;
create policy "Entitled active teachers update their own students"
  on public.students
  for update
  to authenticated
  using (
    (select public.current_user_is_active())
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in ('admin_sekolah', 'operator', 'guru', 'demo')
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = students.tenant_id
        and tenant.active = true
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
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in ('admin_sekolah', 'operator', 'guru', 'demo')
  );

drop policy if exists "Entitled active teachers delete their own students"
  on public.students;
create policy "Entitled active teachers delete their own students"
  on public.students
  for delete
  to authenticated
  using (
    (select public.current_user_is_active())
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in ('admin_sekolah', 'operator', 'guru', 'demo')
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = students.tenant_id
        and tenant.active = true
    )
    and exists (
      select 1
      from public.tenant_entitlements as entitlement
      where entitlement.tenant_id = students.tenant_id
        and entitlement.status in ('trial', 'active')
        and (entitlement.valid_until is null or entitlement.valid_until > now())
    )
  );
