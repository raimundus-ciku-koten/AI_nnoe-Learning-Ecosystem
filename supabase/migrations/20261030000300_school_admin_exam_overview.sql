create or replace function public.school_admin_online_exam_overview()
returns table (
  exam_id uuid,
  title text,
  kelas text,
  starts_at timestamptz,
  ends_at timestamptz,
  duration_minutes integer,
  status text,
  teacher_name text,
  participant_count integer,
  attempt_count integer,
  submitted_count integer,
  pending_review_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'admin_sekolah'
    or (select public.current_tenant_id()) = '' then
    raise exception 'Hanya admin sekolah aktif yang dapat melihat ringkasan ujian tenant.'
      using errcode = '42501';
  end if;

  return query
  select exam.id,
    exam.title,
    exam.kelas,
    exam.starts_at,
    exam.ends_at,
    exam.duration_minutes,
    exam.status,
    coalesce(profile.nama, 'Guru')::text,
    count(distinct link.student_id)::integer,
    count(distinct attempt.id)::integer,
    (count(distinct attempt.id) filter (where attempt.submitted_at is not null))::integer,
    (count(distinct attempt.id) filter (where attempt.grade_pending))::integer
  from public.online_exams as exam
  join public.tenants as tenant
    on tenant.id = exam.tenant_id and tenant.active = true
  left join public.profiles as profile
    on profile.id = exam.owner_id and profile.tenant_id = exam.tenant_id
  left join public.students as student
    on student.tenant_id = exam.tenant_id and student.kelas = exam.kelas
  left join public.student_account_links as link
    on link.student_id = student.id and link.tenant_id = exam.tenant_id
  left join public.online_exam_attempts as attempt
    on attempt.exam_id = exam.id and attempt.student_id = student.id
  where exam.tenant_id = (select public.current_tenant_id())
  group by exam.id, profile.nama
  order by exam.starts_at desc, exam.id;
end;
$$;

revoke all on function public.school_admin_online_exam_overview()
  from public, anon;
grant execute on function public.school_admin_online_exam_overview()
  to authenticated;