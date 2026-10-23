create or replace function public.student_attendance_history()
returns table (
  attendance_date date,
  attendance_status text,
  recorded_at timestamptz,
  class_name text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'siswa'
  then
    raise exception 'Riwayat kehadiran hanya tersedia bagi akun siswa aktif.'
      using errcode = '42501';
  end if;

  return query
  select distinct attendance.tanggal, attendance.status, attendance.waktu, attendance.kelas
  from public.attendance_records as attendance
  join public.tenants as tenant
    on tenant.id = attendance.tenant_id and tenant.active = true
  join public.student_account_links as link
    on link.student_id = attendance.student_id
    and link.tenant_id = attendance.tenant_id
    and link.user_id = auth.uid()
  where attendance.tenant_id = (select public.current_tenant_id())
    and attendance.student_id is not null
  order by attendance.tanggal desc, attendance.waktu desc, attendance.kelas
  limit 366;
end;
$$;

revoke all on function public.student_attendance_history() from public, anon;
grant execute on function public.student_attendance_history() to authenticated;
