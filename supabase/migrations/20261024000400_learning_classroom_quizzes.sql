create table if not exists public.learning_classroom_quizzes (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null,
  tenant_id text not null references public.tenants(id) on delete restrict,
  title text not null check (
    char_length(title) between 1 and 120
    and title = btrim(title)
    and title !~ '[[:cntrl:]]'
  ),
  due_at timestamptz,
  created_by uuid not null default auth.uid()
    references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (classroom_id, tenant_id)
    references public.learning_classrooms(id, tenant_id) on delete cascade
);

create table if not exists public.learning_classroom_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null
    references public.learning_classroom_quizzes(id) on delete cascade,
  position smallint not null check (position between 1 and 50),
  prompt text not null check (char_length(prompt) between 1 and 2000),
  choices jsonb not null check (
    jsonb_typeof(choices) = 'array'
    and jsonb_array_length(choices) between 2 and 6
  ),
  correct_choice smallint not null check (correct_choice between 0 and 5),
  unique (quiz_id, position)
);

create table if not exists public.learning_classroom_quiz_submissions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.learning_classroom_quizzes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  answers jsonb not null check (jsonb_typeof(answers) = 'array'),
  score numeric(5,2) not null check (score between 0 and 100),
  correct_count smallint not null check (correct_count between 0 and 50),
  question_count smallint not null check (question_count between 1 and 50),
  submitted_at timestamptz not null default now(),
  unique (quiz_id, user_id)
);

create index if not exists learning_classroom_quizzes_classroom_created_idx
  on public.learning_classroom_quizzes (tenant_id, classroom_id, created_at desc);
create index if not exists learning_classroom_quiz_submissions_user_idx
  on public.learning_classroom_quiz_submissions (user_id, quiz_id);

alter table public.learning_classroom_quizzes enable row level security;
alter table public.learning_classroom_quiz_questions enable row level security;
alter table public.learning_classroom_quiz_submissions enable row level security;

revoke all on table public.learning_classroom_quizzes,
  public.learning_classroom_quiz_questions,
  public.learning_classroom_quiz_submissions from public, anon, authenticated;
grant select on table public.learning_classroom_quizzes to authenticated;
grant select on table public.learning_classroom_quiz_submissions to authenticated;
grant all on table public.learning_classroom_quizzes,
  public.learning_classroom_quiz_questions,
  public.learning_classroom_quiz_submissions to service_role;

drop policy if exists "Active classroom members read quizzes"
  on public.learning_classroom_quizzes;
create policy "Active classroom members read quizzes"
  on public.learning_classroom_quizzes
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and exists (
      select 1 from public.tenants as tenant
      where tenant.id = learning_classroom_quizzes.tenant_id and tenant.active = true
    )
    and (
      (select public.current_app_role()) = 'superadmin'
      or (
        tenant_id = (select public.current_tenant_id())
        and (
          (select public.current_app_role()) in ('admin_sekolah', 'operator')
          or exists (
            select 1 from public.classroom_members as member
            where member.classroom_id = learning_classroom_quizzes.classroom_id
              and member.tenant_id = learning_classroom_quizzes.tenant_id
              and member.user_id = (select auth.uid())
          )
        )
      )
    )
  );

drop policy if exists "Assigned teachers create quizzes"
  on public.learning_classroom_quizzes;
create policy "Assigned teachers create quizzes"
  on public.learning_classroom_quizzes
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
       and member.classroom_id = learning_classroom_quizzes.classroom_id
       and member.user_id = (select auth.uid())
       and member.member_role = 'guru'
      where tenant.id = learning_classroom_quizzes.tenant_id and tenant.active = true
    )
  );

drop policy if exists "Students read own quiz submissions"
  on public.learning_classroom_quiz_submissions;
create policy "Students read own quiz submissions"
  on public.learning_classroom_quiz_submissions
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and user_id = (select auth.uid())
    and exists (
      select 1
      from public.learning_classroom_quizzes as quiz
      join public.tenants as tenant on tenant.id = quiz.tenant_id and tenant.active = true
      join public.classroom_members as member
        on member.classroom_id = quiz.classroom_id
       and member.tenant_id = quiz.tenant_id
       and member.user_id = (select auth.uid())
       and member.member_role = 'siswa'
      where quiz.id = learning_classroom_quiz_submissions.quiz_id
    )
  );

create or replace function public.create_learning_classroom_quiz(
  p_classroom_id uuid,
  p_title text,
  p_due_at timestamptz,
  p_questions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  quiz_id uuid;
  question jsonb;
  question_count integer;
  position_value integer := 0;
  prompt_value text;
  choices_value jsonb;
  answer_value integer;
begin
  if actor_id is null
    or not public.current_user_is_active()
    or public.current_app_role() not in (
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
    ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if p_questions is null or jsonb_typeof(p_questions) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'invalid-quiz';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 120
    or p_title ~ '[[:cntrl:]]'
    or jsonb_array_length(p_questions) not between 1 and 50 then
    raise exception using errcode = '22023', message = 'invalid-quiz';
  end if;
  if p_due_at is not null and p_due_at <= now() then
    raise exception using errcode = '22023', message = 'quiz-deadline-must-be-future';
  end if;
  if not exists (
    select 1 from public.classroom_members as member
    join public.tenants as tenant on tenant.id = member.tenant_id and tenant.active = true
    where member.classroom_id = p_classroom_id
      and member.tenant_id = public.current_tenant_id()
      and member.user_id = actor_id
      and member.member_role = 'guru'
  ) then
    raise exception using errcode = '42501', message = 'classroom-forbidden';
  end if;

  insert into public.learning_classroom_quizzes (
    classroom_id, tenant_id, title, due_at, created_by
  )
  values (
    p_classroom_id, public.current_tenant_id(), btrim(p_title), p_due_at, actor_id
  )
  returning id into quiz_id;

  for question in select value from jsonb_array_elements(p_questions)
  loop
    position_value := position_value + 1;
    prompt_value := btrim(coalesce(question ->> 'prompt', ''));
    choices_value := question -> 'choices';
    answer_value := (question ->> 'correctChoice')::integer;
    if choices_value is null or jsonb_typeof(choices_value) is distinct from 'array' then
      raise exception using errcode = '22023', message = 'invalid-quiz-question';
    end if;
    if char_length(prompt_value) not between 1 and 2000
      or jsonb_array_length(choices_value) not between 2 and 6
      or answer_value < 0
      or answer_value >= jsonb_array_length(choices_value)
      or exists (
        select 1
        from jsonb_array_elements(choices_value) as choice(value)
        where jsonb_typeof(choice.value) <> 'string'
          or char_length(btrim(choice.value #>> '{}')) not between 1 and 500
      ) then
      raise exception using errcode = '22023', message = 'invalid-quiz-question';
    end if;
    insert into public.learning_classroom_quiz_questions (
      quiz_id, position, prompt, choices, correct_choice
    )
    values (quiz_id, position_value, prompt_value, choices_value, answer_value);
  end loop;

  return quiz_id;
end;
$$;

create or replace function public.learning_classroom_quiz_questions_for_student(p_quiz_id uuid)
returns table (question_id uuid, "position" smallint, prompt text, choices jsonb)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not public.current_user_is_active()
    or public.current_app_role() <> 'siswa' then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if not exists (
    select 1
    from public.learning_classroom_quizzes as quiz
    join public.tenants as tenant on tenant.id = quiz.tenant_id and tenant.active = true
    join public.classroom_members as member
      on member.classroom_id = quiz.classroom_id
     and member.tenant_id = quiz.tenant_id
     and member.user_id = auth.uid()
     and member.member_role = 'siswa'
    where quiz.id = p_quiz_id
      and quiz.tenant_id = public.current_tenant_id()
      and (quiz.due_at is null or quiz.due_at > now())
  ) then
    raise exception using errcode = '42501', message = 'quiz-forbidden-or-expired';
  end if;
  if exists (
    select 1 from public.learning_classroom_quiz_submissions as submission
    where submission.quiz_id = p_quiz_id and submission.user_id = auth.uid()
  ) then
    raise exception using errcode = '22023', message = 'quiz-already-submitted';
  end if;

  return query
  select question.id, question.position, question.prompt, question.choices
  from public.learning_classroom_quiz_questions as question
  where question.quiz_id = p_quiz_id
  order by question.position;
end;
$$;

create or replace function public.submit_learning_classroom_quiz(
  p_quiz_id uuid,
  p_answers jsonb
)
returns table (submission_id uuid, score numeric, correct_count smallint, question_count smallint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  quiz_row public.learning_classroom_quizzes%rowtype;
  question_row record;
  question_total integer := 0;
  correct_total integer := 0;
  selected_answer integer;
  answer_values jsonb;
  result_id uuid;
begin
  if actor_id is null
    or not public.current_user_is_active()
    or public.current_app_role() <> 'siswa' then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'invalid-quiz-answers';
  end if;
  select quiz.* into quiz_row
  from public.learning_classroom_quizzes as quiz
  join public.tenants as tenant on tenant.id = quiz.tenant_id and tenant.active = true
  join public.classroom_members as member
    on member.classroom_id = quiz.classroom_id
   and member.tenant_id = quiz.tenant_id
   and member.user_id = actor_id
   and member.member_role = 'siswa'
  where quiz.id = p_quiz_id
    and quiz.tenant_id = public.current_tenant_id();
  if quiz_row.id is null then
    raise exception using errcode = '42501', message = 'quiz-forbidden';
  end if;
  if quiz_row.due_at is not null and quiz_row.due_at <= now() then
    raise exception using errcode = '22023', message = 'quiz-deadline-passed';
  end if;
  if exists (
    select 1 from public.learning_classroom_quiz_submissions as submission
    where submission.quiz_id = p_quiz_id and submission.user_id = actor_id
  ) then
    raise exception using errcode = '22023', message = 'quiz-already-submitted';
  end if;

  for question_row in
    select question.id, question.correct_choice, question.choices
    from public.learning_classroom_quiz_questions as question
    where question.quiz_id = p_quiz_id
    order by question.position
  loop
    question_total := question_total + 1;
    selected_answer := nullif(p_answers ->> (question_total - 1), '')::integer;
    if selected_answer is null or selected_answer < 0
      or selected_answer >= jsonb_array_length(question_row.choices) then
      raise exception using errcode = '22023', message = 'invalid-quiz-answer';
    end if;
    if selected_answer = question_row.correct_choice then
      correct_total := correct_total + 1;
    end if;
    answer_values := coalesce(answer_values, '[]'::jsonb) || to_jsonb(selected_answer);
  end loop;

  if question_total = 0 or jsonb_array_length(p_answers) <> question_total then
    raise exception using errcode = '22023', message = 'invalid-quiz-answer-count';
  end if;
  insert into public.learning_classroom_quiz_submissions (
    quiz_id, user_id, answers, score, correct_count, question_count
  )
  values (
    p_quiz_id,
    actor_id,
    answer_values,
    round(correct_total * 100.0 / question_total, 2),
    correct_total,
    question_total
  )
  returning id into result_id;

  return query select result_id,
    round(correct_total * 100.0 / question_total, 2),
    correct_total::smallint,
    question_total::smallint;
end;
$$;

create or replace function public.learning_classroom_teacher_quiz_results(p_classroom_id uuid)
returns table (
  quiz_id uuid,
  submission_id uuid,
  user_id uuid,
  student_name text,
  score numeric,
  correct_count smallint,
  question_count smallint,
  submitted_at timestamptz
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
      select 1 from public.classroom_members as member
      join public.tenants as tenant on tenant.id = member.tenant_id and tenant.active = true
      where member.classroom_id = p_classroom_id
        and member.tenant_id = public.current_tenant_id()
        and member.user_id = auth.uid()
        and member.member_role = 'guru'
    ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  return query
  select
    submission.quiz_id,
    submission.id,
    submission.user_id,
    profile.nama,
    submission.score,
    submission.correct_count,
    submission.question_count,
    submission.submitted_at
  from public.learning_classroom_quiz_submissions as submission
  join public.learning_classroom_quizzes as quiz on quiz.id = submission.quiz_id
  join public.profiles as profile on profile.id = submission.user_id
  where quiz.classroom_id = p_classroom_id
    and quiz.tenant_id = public.current_tenant_id()
  order by submission.submitted_at desc
  limit 500;
end;
$$;

revoke all on function public.create_learning_classroom_quiz(uuid, text, timestamptz, jsonb)
  from public, anon, authenticated;
revoke all on function public.learning_classroom_quiz_questions_for_student(uuid)
  from public, anon, authenticated;
revoke all on function public.submit_learning_classroom_quiz(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.learning_classroom_teacher_quiz_results(uuid)
  from public, anon, authenticated;
grant execute on function public.create_learning_classroom_quiz(uuid, text, timestamptz, jsonb)
  to authenticated;
grant execute on function public.learning_classroom_quiz_questions_for_student(uuid)
  to authenticated;
grant execute on function public.submit_learning_classroom_quiz(uuid, jsonb)
  to authenticated;
grant execute on function public.learning_classroom_teacher_quiz_results(uuid)
  to authenticated;
