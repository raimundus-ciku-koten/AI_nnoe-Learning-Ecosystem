create index if not exists attendance_records_tenant_date_class_idx
  on public.attendance_records (tenant_id, tanggal desc, kelas)
  where status = 'hadir' and metode = 'scan';

create or replace function public.school_admin_attendance_report_range(
  p_start_date date,
  p_end_date date
)
returns table (
  tanggal date,
  kelas text,
  hadir_scan bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'admin_sekolah'
    or not exists (
      select 1 from public.tenants as tenant
      where tenant.id = (select public.current_tenant_id())
        and tenant.active = true
    )
  then
    raise exception 'Admin sekolah aktif diperlukan untuk melihat laporan kehadiran.'
      using errcode = '42501';
  end if;

  if p_start_date is null or p_end_date is null
    or p_start_date > p_end_date
    or p_end_date - p_start_date > 365
    or p_end_date > (now() at time zone 'UTC')::date then
    raise exception 'Rentang laporan operasional harus 1 sampai 366 hari dan tidak melewati hari ini.'
      using errcode = '22023';
  end if;

  return query
  select attendance.tanggal, attendance.kelas, count(*)::bigint
  from public.attendance_records as attendance
  where attendance.tenant_id = (select public.current_tenant_id())
    and attendance.status = 'hadir'
    and attendance.metode = 'scan'
    and attendance.tanggal between p_start_date and p_end_date
  group by attendance.tanggal, attendance.kelas
  order by attendance.tanggal desc, attendance.kelas;
end;
$$;

revoke all on function public.school_admin_attendance_report_range(date, date)
  from public, anon;
grant execute on function public.school_admin_attendance_report_range(date, date)
  to authenticated;
