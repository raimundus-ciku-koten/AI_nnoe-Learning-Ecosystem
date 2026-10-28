create table if not exists public.learning_classroom_assignments (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null,
  tenant_id text not null references public.tenants(id) on delete restrict,
  title text not null check (
    char_length(title) between 1 and 120
    and title = btrim(title)
    and title !~ '[[:cntrl:]]'
  ),
  instructions text not null check (
    char_length(instructions) between 1 and 20000
    and instructions = btrim(instructions)
  ),
  due_at timestamptz,
  created_by uuid not null default auth.uid()
    references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (classroom_id, tenant_id)
    references public.learning_classrooms(id, tenant_id) on delete cascade
);

create table if not exists public.learning_classroom_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null
    references public.learning_classroom_assignments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  answer text not null check (
    char_length(answer) between 1 and 20000
    and answer = btrim(answer)
  ),
  submitted_at timestamptz not null default now(),
  score numeric(5,2) check (score between 0 and 100),
  feedback text check (feedback is null or char_length(feedback) <= 2000),
  graded_by uuid references public.profiles(id) on delete restrict,
  graded_at timestamptz,
  unique (assignment_id, user_id),
  check ((score is null and graded_by is null and graded_at is null)
    or (score is not null and graded_by is not null and graded_at is not null))
);

create index if not exists learning_classroom_assignments_classroom_created_idx
  on public.learning_classroom_assignments (tenant_id, classroom_id, created_at desc);
create index if not exists learning_classroom_submissions_assignment_idx
  on public.learning_classroom_submissions (assignment_id, submitted_at desc);

alter table public.learning_classroom_assignments enable row level security;
alter table public.learning_classroom_submissions enable row level security;

revoke all on table public.learning_classroom_assignments,
  public.learning_classroom_submissions from public, anon, authenticated;
grant select, insert on table public.learning_classroom_assignments to authenticated;
grant select on table public.learning_classroom_submissions to authenticated;
grant all on table public.learning_classroom_assignments,
  public.learning_classroom_submissions to service_role;

drop policy if exists "Active classroom members read assignments"
  on public.learning_classroom_assignments;
create policy "Active classroom members read assignments"
  on public.learning_classroom_assignments
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = learning_classroom_assignments.tenant_id
        and tenant.active = true
    )
    and (
      (select public.current_app_role()) = 'superadmin'
      or (
        tenant_id = (select public.current_tenant_id())
        and (
          (select public.current_app_role()) in ('admin_sekolah', 'operator')
          or exists (
            select 1
            from public.classroom_members as member
            where member.classroom_id = learning_classroom_assignments.classroom_id
              and member.tenant_id = learning_classroom_assignments.tenant_id
              and member.user_id = (select auth.uid())
          )
        )
      )
    )
  );

drop policy if exists "Assigned teachers create assignments"
  on public.learning_classroom_assignments;
create policy "Assigned teachers create assignments"
  on public.learning_classroom_assignments
  for insert
  to authenticated
  with check (
    (select public.current_user_is_active())
    and (select public.current_app_role()) in (
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
    and tenant_id = (select public.current_tenant_id())
    and created_by = (select auth.uid())
    and exists (
      select 1
      from public.tenants as tenant
      join public.classroom_members as member
        on member.tenant_id = tenant.id
       and member.classroom_id = learning_classroom_assignments.classroom_id
       and member.user_id = (select auth.uid())
       and member.member_role = 'guru'
      where tenant.id = learning_classroom_assignments.tenant_id
        and tenant.active = true
    )
  );

drop policy if exists "Students and assigned teachers read submissions"
  on public.learning_classroom_submissions;
create policy "Students and assigned teachers read submissions"
  on public.learning_classroom_submissions
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and exists (
      select 1
      from public.learning_classroom_assignments as assignment
      join public.tenants as tenant
        on tenant.id = assignment.tenant_id and tenant.active = true
      where assignment.id = learning_classroom_submissions.assignment_id
        and (
          (
            (select public.current_app_role()) = 'superadmin'
          )
          or (
            assignment.tenant_id = (select public.current_tenant_id())
            and (
              user_id = (select auth.uid())
              or (select public.current_app_role()) in ('admin_sekolah', 'operator')
              or exists (
                select 1
                from public.classroom_members as member
                where member.classroom_id = assignment.classroom_id
                  and member.tenant_id = assignment.tenant_id
                  and member.user_id = (select auth.uid())
                  and member.member_role = 'guru'
              )
            )
          )
        )
    )
  );

create or replace function public.submit_learning_classroom_assignment(
  p_assignment_id uuid,
  p_answer text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  submission_id uuid;
  assignment_row public.learning_classroom_assignments%rowtype;
  normalized_answer text := btrim(coalesce(p_answer, ''));
begin
  if actor_id is null
    or not public.current_user_is_active()
    or public.current_app_role() <> 'siswa' then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  if char_length(normalized_answer) not between 1 and 20000 then
    raise exception using errcode = '22023', message = 'invalid-assignment-answer';
  end if;

  select assignment.*
  into assignment_row
  from public.learning_classroom_assignments as assignment
  join public.tenants as tenant
    on tenant.id = assignment.tenant_id and tenant.active = true
  join public.classroom_members as member
    on member.classroom_id = assignment.classroom_id
   and member.tenant_id = assignment.tenant_id
   and member.user_id = actor_id
   and member.member_role = 'siswa'
  where assignment.id = p_assignment_id
    and assignment.tenant_id = public.current_tenant_id();

  if assignment_row.id is null then
    raise exception using errcode = '42501', message = 'assignment-forbidden';
  end if;
  if assignment_row.due_at is not null and assignment_row.due_at <= now() then
    raise exception using errcode = '22023', message = 'assignment-deadline-passed';
  end if;
  if exists (
    select 1
    from public.learning_classroom_submissions as submission
    where submission.assignment_id = assignment_row.id
      and submission.user_id = actor_id
      and submission.score is not null
  ) then
    raise exception using errcode = '22023', message = 'assignment-already-graded';
  end if;

  insert into public.learning_classroom_submissions (assignment_id, user_id, answer)
  values (assignment_row.id, actor_id, normalized_answer)
  on conflict (assignment_id, user_id)
  do update set
    answer = excluded.answer,
    submitted_at = now(),
    score = null,
    feedback = null,
    graded_by = null,
    graded_at = null
  returning id into submission_id;

  return submission_id;
end;
$$;

revoke all on function public.submit_learning_classroom_assignment(uuid, text)
  from public, anon, authenticated;
grant execute on function public.submit_learning_classroom_assignment(uuid, text)
  to authenticated;

create or replace function public.grade_learning_classroom_submission(
  p_submission_id uuid,
  p_score numeric,
  p_feedback text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  submission_row public.learning_classroom_submissions%rowtype;
  normalized_feedback text := nullif(btrim(coalesce(p_feedback, '')), '');
begin
  if actor_id is null
    or not public.current_user_is_active()
    or public.current_app_role() not in (
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
    ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if p_score is null or p_score < 0 or p_score > 100
    or (normalized_feedback is not null and char_length(normalized_feedback) > 2000) then
    raise exception using errcode = '22023', message = 'invalid-assignment-grade';
  end if;

  update public.learning_classroom_submissions as submission
  set score = p_score,
      feedback = normalized_feedback,
      graded_by = actor_id,
      graded_at = now()
  from public.learning_classroom_assignments as assignment
  join public.tenants as tenant
    on tenant.id = assignment.tenant_id and tenant.active = true
  join public.classroom_members as member
    on member.classroom_id = assignment.classroom_id
   and member.tenant_id = assignment.tenant_id
   and member.user_id = actor_id
   and member.member_role = 'guru'
  where submission.id = p_submission_id
    and assignment.id = submission.assignment_id
    and assignment.tenant_id = public.current_tenant_id()
  returning submission.* into submission_row;

  if submission_row.id is null then
    raise exception using errcode = '42501', message = 'submission-forbidden';
  end if;
  return submission_row.id;
end;
$$;

revoke all on function public.grade_learning_classroom_submission(uuid, numeric, text)
  from public, anon, authenticated;
grant execute on function public.grade_learning_classroom_submission(uuid, numeric, text)
  to authenticated;

create or replace function public.learning_classroom_teacher_submissions(
  p_classroom_id uuid
)
returns table (
  assignment_id uuid,
  submission_id uuid,
  user_id uuid,
  student_name text,
  answer text,
  submitted_at timestamptz,
  score numeric,
  feedback text,
  graded_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not public.current_user_is_active()
    or public.current_app_role() not in (
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
    or not exists (
      select 1
      from public.classroom_members as member
      join public.tenants as tenant
        on tenant.id = member.tenant_id and tenant.active = true
      where member.classroom_id = p_classroom_id
        and member.tenant_id = public.current_tenant_id()
        and member.user_id = auth.uid()
        and member.member_role = 'guru'
    ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  return query
  select
    assignment.id,
    submission.id,
    submission.user_id,
    profile.nama,
    submission.answer,
    submission.submitted_at,
    submission.score,
    submission.feedback,
    submission.graded_at
  from public.learning_classroom_assignments as assignment
  join public.learning_classroom_submissions as submission
    on submission.assignment_id = assignment.id
  join public.profiles as profile on profile.id = submission.user_id
  where assignment.classroom_id = p_classroom_id
    and assignment.tenant_id = public.current_tenant_id()
  order by submission.submitted_at desc
  limit 500;
end;
$$;

revoke all on function public.learning_classroom_teacher_submissions(uuid)
  from public, anon, authenticated;
grant execute on function public.learning_classroom_teacher_submissions(uuid)
  to authenticated;
