create table if not exists public.learning_classroom_homerooms (
  classroom_id uuid primary key,
  tenant_id text not null references public.tenants(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  unique (classroom_id, tenant_id),
  foreign key (classroom_id, tenant_id)
    references public.learning_classrooms(id, tenant_id) on delete cascade
);

create index if not exists learning_classroom_homerooms_user_idx
  on public.learning_classroom_homerooms (tenant_id, user_id, classroom_id);

alter table public.learning_classroom_homerooms enable row level security;
revoke all on table public.learning_classroom_homerooms
  from public, anon, authenticated;
grant all on table public.learning_classroom_homerooms to service_role;

create or replace function public.current_user_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select profile.active
    from public.profiles as profile
    where profile.id = auth.uid()
      and public.current_app_role() in (
        'superadmin', 'admin_sekolah', 'operator', 'guru', 'siswa',
        'ortu', 'orang_tua', 'demo', 'kepala_sekolah', 'wali_kelas'
      )
  ), false)
$$;

revoke all on function public.current_user_is_active() from public, anon;
grant execute on function public.current_user_is_active() to authenticated;

create or replace function public.assign_learning_classroom_homeroom(
  p_classroom_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  classroom_tenant text;
begin
  if auth.uid() is null
    or not public.current_user_is_active()
    or public.current_app_role() <> 'admin_sekolah' then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  select classroom.tenant_id
  into classroom_tenant
  from public.learning_classrooms as classroom
  join public.tenants as tenant
    on tenant.id = classroom.tenant_id and tenant.active = true
  where classroom.id = p_classroom_id
    and classroom.tenant_id = public.current_tenant_id();

  if classroom_tenant is null then
    raise exception using errcode = '42501', message = 'classroom-forbidden';
  end if;

  if p_user_id is null then
    delete from public.learning_classroom_homerooms
    where classroom_id = p_classroom_id and tenant_id = classroom_tenant;
    return;
  end if;

  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = p_user_id
      and profile.tenant_id = classroom_tenant
      and profile.active = true
      and (
        profile.role = 'wali_kelas'
        or coalesce(profile.roles, '{}'::text[]) @> array['wali_kelas']::text[]
      )
  ) then
    raise exception using errcode = '22023', message = 'invalid-homeroom-user';
  end if;

  insert into public.learning_classroom_homerooms (
    classroom_id, tenant_id, user_id, assigned_by
  )
  values (p_classroom_id, classroom_tenant, p_user_id, auth.uid())
  on conflict (classroom_id) do update set
    user_id = excluded.user_id,
    assigned_by = excluded.assigned_by,
    assigned_at = now();
end;
$$;

create or replace function public.learning_classroom_homeroom_candidates(
  p_tenant_id text
)
returns table (id uuid, nama text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not public.current_user_is_active()
    or public.current_app_role() <> 'admin_sekolah'
    or p_tenant_id is distinct from public.current_tenant_id()
    or not exists (
      select 1 from public.tenants as tenant
      where tenant.id = p_tenant_id and tenant.active = true
    ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  return query
  select profile.id, profile.nama
  from public.profiles as profile
  where profile.tenant_id = p_tenant_id
    and profile.active = true
    and (
      profile.role = 'wali_kelas'
      or coalesce(profile.roles, '{}'::text[]) @> array['wali_kelas']::text[]
    )
  order by profile.nama;
end;
$$;

create or replace function public.learning_classroom_homeroom_admin_list(
  p_tenant_id text
)
returns table (
  classroom_id uuid,
  classroom_name text,
  grade text,
  academic_year text,
  homeroom_user_id uuid,
  homeroom_name text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not public.current_user_is_active()
    or public.current_app_role() <> 'admin_sekolah'
    or p_tenant_id is distinct from public.current_tenant_id()
    or not exists (
      select 1 from public.tenants as tenant
      where tenant.id = p_tenant_id and tenant.active = true
    ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  return query
  select classroom.id, classroom.name, classroom.grade,
    classroom.academic_year, assignment.user_id, profile.nama
  from public.learning_classrooms as classroom
  left join public.learning_classroom_homerooms as assignment
    on assignment.classroom_id = classroom.id
   and assignment.tenant_id = classroom.tenant_id
  left join public.profiles as profile
    on profile.id = assignment.user_id
   and profile.tenant_id = classroom.tenant_id
  where classroom.tenant_id = p_tenant_id
  order by classroom.name;
end;
$$;

create or replace function public.learning_classroom_homeroom_classes()
returns table (
  classroom_id uuid,
  classroom_name text,
  grade text,
  academic_year text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not public.current_user_is_active()
    or public.current_app_role() <> 'wali_kelas'
    or not exists (
      select 1 from public.tenants as tenant
      where tenant.id = public.current_tenant_id() and tenant.active = true
    ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  return query
  select classroom.id, classroom.name, classroom.grade, classroom.academic_year
  from public.learning_classroom_homerooms as assignment
  join public.learning_classrooms as classroom
    on classroom.id = assignment.classroom_id
   and classroom.tenant_id = assignment.tenant_id
  where assignment.user_id = auth.uid()
    and assignment.tenant_id = public.current_tenant_id()
  order by classroom.name;
end;
$$;

create or replace function public.learning_classroom_homeroom_report(
  p_classroom_id uuid
)
returns table (
  student_id uuid,
  student_name text,
  attendance_sessions bigint,
  hadir bigint,
  izin bigint,
  sakit bigint,
  alpa bigint,
  graded_assignments bigint,
  assignment_average numeric,
  completed_quizzes bigint,
  quiz_average numeric
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not public.current_user_is_active()
    or public.current_app_role() <> 'wali_kelas'
    or not exists (
      select 1
      from public.learning_classroom_homerooms as assignment
      join public.tenants as tenant
        on tenant.id = assignment.tenant_id and tenant.active = true
      where assignment.classroom_id = p_classroom_id
        and assignment.tenant_id = public.current_tenant_id()
        and assignment.user_id = auth.uid()
    ) then
    raise exception using errcode = '42501', message = 'classroom-forbidden';
  end if;

  return query
  with attendance_summary as (
    select session.classroom_id, record.student_id,
      count(*)::bigint as sessions,
      count(*) filter (where record.status = 'hadir')::bigint as hadir_count,
      count(*) filter (where record.status = 'izin')::bigint as izin_count,
      count(*) filter (where record.status = 'sakit')::bigint as sakit_count,
      count(*) filter (where record.status = 'alpa')::bigint as alpa_count
    from public.learning_classroom_attendance_sessions as session
    join public.learning_classroom_attendance as record
      on record.session_id = session.id
    where session.classroom_id = p_classroom_id
      and session.tenant_id = public.current_tenant_id()
    group by session.classroom_id, record.student_id
  ),
  assignment_summary as (
    select assignment.classroom_id, submission.user_id,
      count(*)::bigint as graded_count, avg(submission.score)::numeric as score_average
    from public.learning_classroom_assignments as assignment
    join public.learning_classroom_submissions as submission
      on submission.assignment_id = assignment.id
    where assignment.classroom_id = p_classroom_id
      and assignment.tenant_id = public.current_tenant_id()
      and submission.score is not null
    group by assignment.classroom_id, submission.user_id
  ),
  quiz_summary as (
    select quiz.classroom_id, submission.user_id,
      count(*)::bigint as quiz_count, avg(submission.score)::numeric as score_average
    from public.learning_classroom_quizzes as quiz
    join public.learning_classroom_quiz_submissions as submission
      on submission.quiz_id = quiz.id
    where quiz.classroom_id = p_classroom_id
      and quiz.tenant_id = public.current_tenant_id()
    group by quiz.classroom_id, submission.user_id
  )
  select profile.id, profile.nama,
    coalesce(attendance_summary.sessions, 0),
    coalesce(attendance_summary.hadir_count, 0),
    coalesce(attendance_summary.izin_count, 0),
    coalesce(attendance_summary.sakit_count, 0),
    coalesce(attendance_summary.alpa_count, 0),
    coalesce(assignment_summary.graded_count, 0),
    assignment_summary.score_average,
    coalesce(quiz_summary.quiz_count, 0),
    quiz_summary.score_average
  from public.classroom_members as member
  join public.profiles as profile
    on profile.id = member.user_id
   and profile.tenant_id = member.tenant_id
   and profile.active = true
   and profile.role = 'siswa'
  left join attendance_summary
    on attendance_summary.student_id = profile.id
   and attendance_summary.classroom_id = member.classroom_id
  left join assignment_summary
    on assignment_summary.user_id = profile.id
   and assignment_summary.classroom_id = member.classroom_id
  left join quiz_summary
    on quiz_summary.user_id = profile.id
   and quiz_summary.classroom_id = member.classroom_id
  where member.classroom_id = p_classroom_id
    and member.tenant_id = public.current_tenant_id()
    and member.member_role = 'siswa'
  order by profile.nama;
end;
$$;

create or replace function public.learning_school_principal_summary()
returns table (
  classroom_count bigint,
  student_count bigint,
  attendance_records bigint,
  attendance_rate numeric,
  graded_submissions bigint,
  assignment_average numeric,
  quiz_submissions bigint,
  quiz_average numeric
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not public.current_user_is_active()
    or public.current_app_role() <> 'kepala_sekolah'
    or not exists (
      select 1 from public.tenants as tenant
      where tenant.id = public.current_tenant_id() and tenant.active = true
    ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  return query
  select
    (select count(*)::bigint from public.learning_classrooms as classroom
     where classroom.tenant_id = public.current_tenant_id()),
    (select count(distinct member.user_id)::bigint
     from public.classroom_members as member
     join public.profiles as profile
       on profile.id = member.user_id and profile.tenant_id = member.tenant_id
      and profile.active = true and profile.role = 'siswa'
     where member.tenant_id = public.current_tenant_id()
       and member.member_role = 'siswa'),
    (select count(*)::bigint
     from public.learning_classroom_attendance_sessions as session
     join public.learning_classroom_attendance as record on record.session_id = session.id
     where session.tenant_id = public.current_tenant_id()),
    (select case when count(distinct record.student_id) >= 5 then round(
       count(*) filter (where record.status = 'hadir')::numeric
       / nullif(count(*), 0) * 100, 1
     ) else null end
     from public.learning_classroom_attendance_sessions as session
     join public.learning_classroom_attendance as record on record.session_id = session.id
     where session.tenant_id = public.current_tenant_id()),
    (select count(*)::bigint
     from public.learning_classroom_assignments as assignment
     join public.learning_classroom_submissions as submission
       on submission.assignment_id = assignment.id
     where assignment.tenant_id = public.current_tenant_id()
       and submission.score is not null),
    (select case when count(distinct submission.user_id) >= 5
       then avg(submission.score)::numeric else null end
     from public.learning_classroom_assignments as assignment
     join public.learning_classroom_submissions as submission
       on submission.assignment_id = assignment.id
     where assignment.tenant_id = public.current_tenant_id()
       and submission.score is not null),
    (select count(*)::bigint
     from public.learning_classroom_quizzes as quiz
     join public.learning_classroom_quiz_submissions as submission
       on submission.quiz_id = quiz.id
     where quiz.tenant_id = public.current_tenant_id()),
    (select case when count(distinct submission.user_id) >= 5
       then avg(submission.score)::numeric else null end
     from public.learning_classroom_quizzes as quiz
     join public.learning_classroom_quiz_submissions as submission
       on submission.quiz_id = quiz.id
     where quiz.tenant_id = public.current_tenant_id());
end;
$$;

revoke all on function public.assign_learning_classroom_homeroom(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.learning_classroom_homeroom_candidates(text)
  from public, anon, authenticated;
revoke all on function public.learning_classroom_homeroom_admin_list(text)
  from public, anon, authenticated;
revoke all on function public.learning_classroom_homeroom_classes()
  from public, anon, authenticated;
revoke all on function public.learning_classroom_homeroom_report(uuid)
  from public, anon, authenticated;
revoke all on function public.learning_school_principal_summary()
  from public, anon, authenticated;

grant execute on function public.assign_learning_classroom_homeroom(uuid, uuid)
  to authenticated;
grant execute on function public.learning_classroom_homeroom_candidates(text)
  to authenticated;
grant execute on function public.learning_classroom_homeroom_admin_list(text)
  to authenticated;
grant execute on function public.learning_classroom_homeroom_classes()
  to authenticated;
grant execute on function public.learning_classroom_homeroom_report(uuid)
  to authenticated;
grant execute on function public.learning_school_principal_summary()
  to authenticated;
