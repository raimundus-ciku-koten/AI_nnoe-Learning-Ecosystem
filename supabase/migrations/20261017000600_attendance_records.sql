create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete restrict,
  student_id uuid references public.students(id) on delete set null,
  tanggal date not null,
  status text not null check (status = 'hadir'),
  metode text not null check (metode = 'scan'),
  kode_unik text not null check (
    kode_unik ~ '^ALE-[A-Z0-9]{1,6}-[A-Z0-9]{6}-[0-9]{4}$'
  ),
  nama text not null check (
    char_length(nama) between 1 and 200
    and nama = btrim(nama)
    and nama !~ '[[:cntrl:]]'
  ),
  kelas text not null check (
    char_length(kelas) between 1 and 50
    and kelas = btrim(kelas)
    and kelas !~ '[[:cntrl:]]'
  ),
  waktu timestamptz not null default now()
);

create unique index if not exists attendance_records_student_day_unique
  on public.attendance_records (tenant_id, owner_id, tanggal, student_id)
  where student_id is not null;

create index if not exists attendance_records_owner_date_idx
  on public.attendance_records (owner_id, tanggal desc, id desc);

alter table public.attendance_records enable row level security;

revoke all on table public.attendance_records from anon, authenticated;
grant select on table public.attendance_records to authenticated;
grant insert (
  tenant_id, owner_id, student_id, tanggal, status, metode, kode_unik, nama, kelas
)
  on table public.attendance_records to authenticated;
grant all on table public.attendance_records to service_role;

drop policy if exists "Active teachers read their own attendance"
  on public.attendance_records;
create policy "Active teachers read their own attendance"
  on public.attendance_records
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in ('admin_sekolah', 'operator', 'guru', 'demo')
  );

drop policy if exists "Entitled teachers record matching student attendance"
  on public.attendance_records;
create policy "Entitled teachers record matching student attendance"
  on public.attendance_records
  for insert
  to authenticated
  with check (
    (select public.current_user_is_active())
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and student_id is not null
    and (select public.current_app_role()) in ('admin_sekolah', 'operator', 'guru', 'demo')
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = attendance_records.tenant_id
        and tenant.active = true
    )
    and exists (
      select 1
      from public.tenant_entitlements as entitlement
      where entitlement.tenant_id = attendance_records.tenant_id
        and entitlement.status in ('trial', 'active')
        and (entitlement.valid_until is null or entitlement.valid_until > now())
    )
    and exists (
      select 1
      from public.students as student
      where student.id = attendance_records.student_id
        and student.owner_id = attendance_records.owner_id
        and student.tenant_id = attendance_records.tenant_id
        and student.kode_unik = attendance_records.kode_unik
        and student.nama = attendance_records.nama
        and student.kelas = attendance_records.kelas
    )
  );
