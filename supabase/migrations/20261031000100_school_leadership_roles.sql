create or replace function public.current_user_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select profile.active
      and profile.role <> 'demo'
      and public.current_app_role() in (
        'superadmin', 'admin_sekolah', 'operator', 'guru', 'siswa',
        'ortu', 'orang_tua', 'wali_kelas', 'kepala_sekolah'
      )
      and case
        when public.current_app_role() in ('admin_sekolah', 'superadmin')
          then auth.jwt() ->> 'aal' = 'aal2'
        else true
      end
    from public.profiles as profile
    where profile.id = auth.uid()
  ), false)
$$;

revoke all on function public.current_user_is_active() from public, anon;
grant execute on function public.current_user_is_active() to authenticated;

create or replace function public.homeroom_exam_grade_ledger()
returns table (
  student_id uuid,
  student_name text,
  kelas text,
  exam_id uuid,
  exam_title text,
  starts_at timestamptz,
  duration_minutes integer,
  attempt_status text,
  objective_correct integer,
  objective_total integer,
  score numeric,
  grade_pending boolean,
  submitted_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'wali_kelas'
    or (select public.current_tenant_id()) = '' then
    raise exception 'Hanya wali kelas aktif yang dapat melihat leger kelas.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = auth.uid()
      and profile.tenant_id = (select public.current_tenant_id())
      and profile.active = true
      and profile.roles @> array['guru', 'wali_kelas']::text[]
      and cardinality(profile.kelas_ids) > 0
  ) then
    raise exception 'Akun wali kelas harus berupa akun guru aktif dengan penugasan kelas.'
      using errcode = '42501';
  end if;

  return query
  select student.id,
    student.nama::text,
    student.kelas::text,
    exam.id,
    exam.title::text,
    exam.starts_at,
    exam.duration_minutes,
    case
      when exam.id is null then 'not_scheduled'::text
      when attempt.submitted_at is not null then 'submitted'::text
      when attempt.id is not null then 'in_progress'::text
      else 'not_started'::text
    end,
    coalesce(attempt.objective_correct, 0),
    coalesce(attempt.objective_total, 0),
    case when attempt.grade_pending then null else attempt.score end,
    coalesce(attempt.grade_pending, false),
    attempt.submitted_at
  from public.profiles as profile
  join public.students as student
    on student.tenant_id = profile.tenant_id
    and student.kelas = any(profile.kelas_ids)
  join public.tenants as tenant
    on tenant.id = student.tenant_id and tenant.active = true
  left join public.online_exams as exam
    on exam.tenant_id = student.tenant_id
    and exam.kelas = student.kelas
    and (not exists (
      select 1 from public.online_exam_recipients as target
      where target.exam_id = exam.id
    ) or exists (
      select 1 from public.online_exam_recipients as target
      where target.exam_id = exam.id and target.student_id = student.id
    ))
  left join public.online_exam_attempts as attempt
    on attempt.exam_id = exam.id and attempt.student_id = student.id
  where profile.id = auth.uid()
    and profile.tenant_id = (select public.current_tenant_id())
    and profile.active = true
    and profile.roles @> array['guru', 'wali_kelas']::text[]
  order by student.kelas, student.nama, exam.starts_at desc nulls last, exam.id;
end;
$$;

revoke all on function public.homeroom_exam_grade_ledger() from public, anon;
grant execute on function public.homeroom_exam_grade_ledger() to authenticated;