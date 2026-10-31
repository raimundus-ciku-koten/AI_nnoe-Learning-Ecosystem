create table if not exists public.school_units (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete restrict,
  code text not null check (
    code = upper(btrim(code))
    and code ~ '^[A-Z0-9][A-Z0-9_-]{0,29}$'
  ),
  name text not null check (
    char_length(name) between 1 and 120
    and name = btrim(name)
  ),
  education_level text not null check (
    education_level in ('paud', 'sd', 'smp', 'sma', 'smk', 'ma', 'mak', 'slb', 'lainnya')
  ),
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists school_units_tenant_code_unique
  on public.school_units (tenant_id, lower(code));
create index if not exists school_units_tenant_active_name_idx
  on public.school_units (tenant_id, active desc, name);

drop trigger if exists school_units_set_updated_at on public.school_units;
create trigger school_units_set_updated_at
  before update on public.school_units
  for each row execute function public.set_updated_at();

alter table public.school_units enable row level security;
revoke all on table public.school_units from public, anon, authenticated;
grant select on table public.school_units to authenticated;
grant insert (tenant_id, code, name, education_level, created_by, updated_by)
  on table public.school_units to authenticated;
grant update (code, name, education_level, active, updated_by)
  on table public.school_units to authenticated;
grant all on table public.school_units to service_role;

drop policy if exists "Active tenant members read school units" on public.school_units;
create policy "Active tenant members read school units"
  on public.school_units
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = school_units.tenant_id
        and tenant.active = true
    )
    and (
      (select public.current_app_role()) = 'superadmin'
      or (
        tenant_id = (select public.current_tenant_id())
        and (select public.current_app_role()) in (
          'admin_sekolah', 'operator', 'guru', 'siswa', 'ortu', 'orang_tua'
        )
      )
    )
  );

drop policy if exists "Active school admins create school units" on public.school_units;
create policy "Active school admins create school units"
  on public.school_units
  for insert
  to authenticated
  with check (
    (select public.current_user_is_active())
    and (select public.current_app_role()) = 'admin_sekolah'
    and tenant_id = (select public.current_tenant_id())
    and created_by = (select auth.uid())
    and updated_by = (select auth.uid())
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = school_units.tenant_id
        and tenant.active = true
    )
  );

drop policy if exists "Active school admins update school units" on public.school_units;
create policy "Active school admins update school units"
  on public.school_units
  for update
  to authenticated
  using (
    (select public.current_user_is_active())
    and (select public.current_app_role()) = 'admin_sekolah'
    and tenant_id = (select public.current_tenant_id())
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = school_units.tenant_id
        and tenant.active = true
    )
  )
  with check (
    (select public.current_user_is_active())
    and (select public.current_app_role()) = 'admin_sekolah'
    and tenant_id = (select public.current_tenant_id())
    and updated_by = (select auth.uid())
  );