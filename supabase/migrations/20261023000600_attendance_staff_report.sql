create or replace function public.school_attendance_report(
  p_attendance_date date default null,
  p_class_name text default null,
  p_student_search text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  id uuid,
  student_id uuid,
  student_name text,
  class_name text,
  attendance_date date,
  attendance_status text,
  recorded_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text := (select public.current_app_role());
  active_tenant_id text := (select public.current_tenant_id());
  search_text text := nullif(btrim(p_student_search), '');
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or actor_role not in (
      'admin_sekolah', 'operator', 'guru', 'guru_bk',
      'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
    or not exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.active = true
        and profile.role = actor_role
        and profile.tenant_id = active_tenant_id
    )
    or not exists (
      select 1
      from public.tenants as tenant
      where tenant.id = active_tenant_id
        and tenant.active = true
    )
  then
    raise exception 'Laporan presensi hanya tersedia bagi staf sekolah aktif.'
      using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 200
    or p_offset is null or p_offset not between 0 and 1000000
  then
    raise exception 'Batas dan posisi halaman laporan tidak valid.'
      using errcode = '22023';
  end if;
  if p_class_name is not null
    and (char_length(btrim(p_class_name)) not between 1 and 30
      or p_class_name <> btrim(p_class_name))
  then
    raise exception 'Nama kelas tidak valid.'
      using errcode = '22023';
  end if;
  if search_text is not null and char_length(search_text) > 100 then
    raise exception 'Pencarian nama siswa maksimal 100 karakter.'
      using errcode = '22023';
  end if;

  return query
  select attendance.id, attendance.student_id, student.nama,
    attendance.kelas, attendance.tanggal, attendance.status, attendance.waktu
  from public.attendance_records as attendance
  join public.students as student
    on student.id = attendance.student_id
    and student.tenant_id = attendance.tenant_id
  where attendance.tenant_id = active_tenant_id
    and (p_attendance_date is null or attendance.tanggal = p_attendance_date)
    and (p_class_name is null or attendance.kelas = p_class_name)
    and (
      actor_role in ('admin_sekolah', 'operator')
      or student.owner_id = auth.uid()
    )
    and (
      search_text is null
      or position(lower(search_text) in lower(student.nama)) > 0
      or position(lower(search_text) in lower(student.id::text)) > 0
    )
  order by attendance.tanggal desc, attendance.waktu desc, attendance.id
  limit p_limit
  offset p_offset;
end;
$$;

revoke all on function public.school_attendance_report(date, text, text, integer, integer)
  from public, anon;
grant execute on function public.school_attendance_report(date, text, text, integer, integer)
  to authenticated;
