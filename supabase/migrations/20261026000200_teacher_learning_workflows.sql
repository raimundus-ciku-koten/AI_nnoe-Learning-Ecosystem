alter table public.learning_classroom_journals
  add column if not exists planning_package_id text,
  add column if not exists planning_document_type text,
  add column if not exists planning_unit text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.learning_classroom_journals'::regclass
      and conname = 'learning_classroom_journals_planning_reference_check'
  ) then
    alter table public.learning_classroom_journals
      add constraint learning_classroom_journals_planning_reference_check
      check (
        (
          planning_package_id is null
          and planning_document_type is null
          and planning_unit is null
        )
        or (
          planning_package_id is not null
          and char_length(btrim(planning_package_id)) between 1 and 120
          and planning_document_type in ('rpe', 'atp', 'prota', 'prosem', 'kktp', 'modul')
          and (
            (planning_document_type = 'modul' and planning_unit is not null
              and char_length(btrim(planning_unit)) between 1 and 80)
            or (planning_document_type <> 'modul' and planning_unit is null)
          )
        )
      );
  end if;
end;
$$;

create index if not exists learning_classroom_journals_planning_reference_idx
  on public.learning_classroom_journals
  (tenant_id, author_id, planning_package_id, planning_document_type)
  where planning_package_id is not null;

alter table public.online_exams
  add column if not exists assessment_type text not null default 'umum'
    check (assessment_type in ('umum', 'diagnostik', 'formatif', 'sumatif'));

create index if not exists online_exams_owner_type_schedule_idx
  on public.online_exams (tenant_id, owner_id, assessment_type, starts_at desc);

create or replace function public.current_user_has_assigned_question_class(
  p_tenant_id text,
  p_kelas text,
  p_mapel text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and (select public.current_user_is_active())
    and p_tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in (
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
    and exists (
      select 1
      from public.tenants as tenant
      join public.learning_classrooms as classroom
        on classroom.tenant_id = tenant.id
       and classroom.name = btrim(p_kelas)
       and classroom.subject = btrim(p_mapel)
      join public.classroom_members as member
        on member.classroom_id = classroom.id
       and member.tenant_id = classroom.tenant_id
       and member.user_id = (select auth.uid())
       and member.member_role = 'guru'
      where tenant.id = p_tenant_id
        and tenant.active = true
    )
$$;

revoke all on function public.current_user_has_assigned_question_class(text, text, text)
  from public, anon;
grant execute on function public.current_user_has_assigned_question_class(text, text, text)
  to authenticated, service_role;

create or replace function public.current_user_can_write_question(
  p_tenant_id text,
  p_kelas text,
  p_mapel text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and (select public.current_user_is_active())
    and p_tenant_id = (select public.current_tenant_id())
    and exists (
      select 1 from public.tenants as tenant
      where tenant.id = p_tenant_id and tenant.active = true
    )
    and (
      (select public.current_app_role()) = 'guru'
      or (
        (select public.current_app_role()) in (
          'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
        )
        and (select public.current_user_has_assigned_question_class(
          p_tenant_id, p_kelas, p_mapel
        ))
      )
    )
$$;

revoke all on function public.current_user_can_write_question(text, text, text)
  from public, anon;
grant execute on function public.current_user_can_write_question(text, text, text)
  to authenticated, service_role;

drop policy if exists "Active school staff read tenant question bank"
  on public.question_bank;
create policy "Active school staff read tenant question bank"
  on public.question_bank
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and (
      (select public.current_app_role()) = 'superadmin'
      or (
        tenant_id = (select public.current_tenant_id())
        and exists (
          select 1 from public.tenants as tenant
          where tenant.id = question_bank.tenant_id
            and tenant.active = true
        )
        and (select public.current_app_role()) in ('admin', 'admin_sekolah', 'guru')
      )
      or (
        owner_id = (select auth.uid())
        and (select public.current_user_can_write_question(
          tenant_id, kelas, mapel
        ))
      )
    )
  );

drop policy if exists "Entitled teachers create their own tenant questions"
  on public.question_bank;
create policy "Entitled teachers create their own tenant questions"
  on public.question_bank
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_user_can_write_question(
      tenant_id, kelas, mapel
    ))
    and (
      exists (
        select 1 from public.tenant_entitlements as entitlement
        where entitlement.tenant_id = question_bank.tenant_id
          and entitlement.status in ('trial', 'active')
          and (entitlement.valid_until is null or entitlement.valid_until > now())
      )
      or exists (
        select 1
        from public.personal_entitlements as entitlement
        join public.billing_plans as plan on plan.id = entitlement.plan_id
        where entitlement.user_id = (select auth.uid())
          and entitlement.status in ('trial', 'active')
          and (entitlement.valid_until is null or entitlement.valid_until > now())
          and plan.allowed_role = 'guru'
          and plan.active = true
      )
    )
  );

drop policy if exists "Entitled teachers update their own tenant questions"
  on public.question_bank;
create policy "Entitled teachers update their own tenant questions"
  on public.question_bank
  for update
  to authenticated
  using (
    owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_user_can_write_question(
      tenant_id, kelas, mapel
    ))
    and (
      exists (
        select 1 from public.tenant_entitlements as entitlement
        where entitlement.tenant_id = question_bank.tenant_id
          and entitlement.status in ('trial', 'active')
          and (entitlement.valid_until is null or entitlement.valid_until > now())
      )
      or exists (
        select 1
        from public.personal_entitlements as entitlement
        join public.billing_plans as plan on plan.id = entitlement.plan_id
        where entitlement.user_id = (select auth.uid())
          and entitlement.status in ('trial', 'active')
          and (entitlement.valid_until is null or entitlement.valid_until > now())
          and plan.allowed_role = 'guru'
          and plan.active = true
      )
    )
  )
  with check (
    owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_user_can_write_question(
      tenant_id, kelas, mapel
    ))
  );

drop policy if exists "Entitled teachers delete their own tenant questions"
  on public.question_bank;
create policy "Entitled teachers delete their own tenant questions"
  on public.question_bank
  for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_user_has_assigned_question_class(
      tenant_id, kelas, mapel
    ))
    and (
      exists (
        select 1 from public.tenant_entitlements as entitlement
        where entitlement.tenant_id = question_bank.tenant_id
          and entitlement.status in ('trial', 'active')
          and (entitlement.valid_until is null or entitlement.valid_until > now())
      )
      or exists (
        select 1
        from public.personal_entitlements as entitlement
        join public.billing_plans as plan on plan.id = entitlement.plan_id
        where entitlement.user_id = (select auth.uid())
          and entitlement.status in ('trial', 'active')
          and (entitlement.valid_until is null or entitlement.valid_until > now())
          and plan.allowed_role = 'guru'
          and plan.active = true
      )
    )
  );

create or replace function public.create_online_exam(
  p_title text,
  p_kelas text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_duration_minutes integer,
  p_question_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_exam_id uuid;
  question_count integer;
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) not in (
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
  then
    raise exception 'Hanya guru aktif yang dapat membuat ujian.'
      using errcode = '42501';
  end if;

  if p_title is null or char_length(btrim(p_title)) not between 1 and 160
    or p_kelas is null or char_length(btrim(p_kelas)) not between 1 and 30
    or p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at
    or p_duration_minutes not between 1 and 300
    or p_question_ids is null or cardinality(p_question_ids) not between 1 and 100
    or array_position(p_question_ids, null) is not null
  then
    raise exception 'Pengaturan ujian tidak valid.'
      using errcode = '22023';
  end if;

  select count(distinct question_id)::integer
    into question_count
  from unnest(p_question_ids) as selected(question_id);

  if question_count <> cardinality(p_question_ids) then
    raise exception 'Daftar soal tidak boleh berisi duplikasi.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.tenants as tenant
    where tenant.id = (select public.current_tenant_id())
      and tenant.active = true
  ) then
    raise exception 'Sekolah tidak aktif.'
      using errcode = '42501';
  end if;

  if (
    select count(*)
    from unnest(p_question_ids) as selected(question_id)
    join public.question_bank as question on question.id = selected.question_id
    where question.tenant_id = (select public.current_tenant_id())
      and question.owner_id = auth.uid()
      and question.kelas = btrim(p_kelas)
      and (select public.current_user_has_assigned_question_class(
        question.tenant_id, question.kelas, question.mapel
      ))
  ) <> cardinality(p_question_ids) then
    raise exception 'Semua soal harus dimiliki guru, sesuai kelas, dan kelasnya ditugaskan.'
      using errcode = '42501';
  end if;

  insert into public.online_exams (
    tenant_id, owner_id, kelas, title, starts_at, ends_at, duration_minutes
  )
  values (
    (select public.current_tenant_id()),
    auth.uid(),
    btrim(p_kelas),
    btrim(p_title),
    p_starts_at,
    p_ends_at,
    p_duration_minutes
  )
  returning id into new_exam_id;

  insert into public.online_exam_items (
    exam_id, position, kind, prompt, choices, correct_answer
  )
  select
    new_exam_id,
    selected.ordinality::integer,
    question.jenis,
    question.pertanyaan,
    question.pilihan,
    question.jawaban
  from unnest(p_question_ids) with ordinality as selected(question_id, ordinality)
  join public.question_bank as question on question.id = selected.question_id;

  return new_exam_id;
end;
$$;

create or replace function public.create_typed_online_exam(
  p_title text,
  p_kelas text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_duration_minutes integer,
  p_question_ids uuid[],
  p_assessment_type text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_exam_id uuid;
begin
  if p_assessment_type is null
    or p_assessment_type not in ('umum', 'diagnostik', 'formatif', 'sumatif')
  then
    raise exception 'Jenis asesmen tidak valid.'
      using errcode = '22023';
  end if;

  new_exam_id := public.create_online_exam(
    p_title,
    p_kelas,
    p_starts_at,
    p_ends_at,
    p_duration_minutes,
    p_question_ids
  );

  update public.online_exams
  set assessment_type = p_assessment_type
  where id = new_exam_id
    and owner_id = auth.uid()
    and tenant_id = (select public.current_tenant_id());

  if not found then
    raise exception 'Jenis asesmen tidak dapat disimpan.'
      using errcode = '42501';
  end if;

  return new_exam_id;
end;
$$;

create or replace function public.teacher_online_exam_results()
returns table (
  attempt_id uuid,
  exam_id uuid,
  title text,
  kelas text,
  student_name text,
  submitted_at timestamptz,
  score numeric,
  objective_correct integer,
  objective_total integer,
  essay_score numeric,
  grade_pending boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) not in (
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
  then
    raise exception 'Hanya guru aktif yang dapat melihat hasil ujian miliknya.'
      using errcode = '42501';
  end if;

  return query
  select attempt.id, exam.id, exam.title, exam.kelas, student.nama,
    attempt.submitted_at, attempt.score, attempt.objective_correct,
    attempt.objective_total, attempt.essay_score, attempt.grade_pending
  from public.online_exam_attempts as attempt
  join public.online_exams as exam on exam.id = attempt.exam_id
  join public.students as student on student.id = attempt.student_id
  join public.tenants as tenant on tenant.id = exam.tenant_id and tenant.active = true
  where exam.owner_id = auth.uid()
    and exam.tenant_id = (select public.current_tenant_id())
    and attempt.submitted_at is not null
  order by exam.starts_at desc, exam.id, student.nama, attempt.id;
end;
$$;

create or replace function public.teacher_online_exam_overview()
returns table (
  exam_id uuid,
  title text,
  kelas text,
  starts_at timestamptz,
  ends_at timestamptz,
  duration_minutes integer,
  status text,
  participant_count integer,
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
    or (select public.current_app_role()) not in (
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
  then
    raise exception 'Hanya guru aktif yang dapat melihat ujian miliknya.'
      using errcode = '42501';
  end if;

  return query
  select exam.id, exam.title, exam.kelas, exam.starts_at, exam.ends_at,
    exam.duration_minutes, exam.status,
    count(distinct link.student_id)::integer,
    (count(distinct attempt.id) filter (where attempt.submitted_at is not null))::integer,
    (count(distinct attempt.id) filter (where attempt.grade_pending))::integer
  from public.online_exams as exam
  join public.tenants as tenant on tenant.id = exam.tenant_id and tenant.active = true
  left join public.students as student
    on student.tenant_id = exam.tenant_id and student.kelas = exam.kelas
  left join public.student_account_links as link
    on link.student_id = student.id and link.tenant_id = exam.tenant_id
  left join public.online_exam_attempts as attempt
    on attempt.exam_id = exam.id and attempt.student_id = student.id
  where exam.owner_id = auth.uid()
    and exam.tenant_id = (select public.current_tenant_id())
  group by exam.id
  order by exam.starts_at desc, exam.id;
end;
$$;

create or replace function public.teacher_online_exam_essay_reviews()
returns table (
  attempt_id uuid,
  exam_id uuid,
  title text,
  kelas text,
  student_name text,
  submitted_at timestamptz,
  essay_responses jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) not in (
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
  then
    raise exception 'Hanya guru aktif yang dapat meninjau jawaban ujian.'
      using errcode = '42501';
  end if;

  return query
  select attempt.id, exam.id, exam.title, exam.kelas, student.nama,
    attempt.submitted_at,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'prompt', item.prompt,
        'answer', attempt.answers ->> item.id::text
      ) order by item.position
    ), '[]'::jsonb)
  from public.online_exam_attempts as attempt
  join public.online_exams as exam on exam.id = attempt.exam_id
  join public.students as student on student.id = attempt.student_id
  join public.tenants as tenant on tenant.id = exam.tenant_id and tenant.active = true
  join public.online_exam_items as item on item.exam_id = exam.id and item.kind = 'uraian'
  where exam.owner_id = auth.uid()
    and exam.tenant_id = (select public.current_tenant_id())
    and attempt.grade_pending = true
  group by attempt.id, exam.id, exam.title, exam.kelas, student.nama, attempt.submitted_at
  order by attempt.submitted_at, attempt.id;
end;
$$;

create or replace function public.review_online_exam_essays(
  p_attempt_id uuid,
  p_essay_score numeric
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_attempt public.online_exam_attempts%rowtype;
  essay_total integer;
  final_score numeric(5,2);
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) not in (
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
  then
    raise exception 'Hanya guru aktif yang dapat menilai jawaban uraian.'
      using errcode = '42501';
  end if;

  if p_essay_score is null or p_essay_score not between 0 and 100 then
    raise exception 'Nilai uraian harus berada antara 0 dan 100.'
      using errcode = '22023';
  end if;

  select attempt.*
    into selected_attempt
  from public.online_exam_attempts as attempt
  join public.online_exams as exam on exam.id = attempt.exam_id
  join public.tenants as tenant on tenant.id = exam.tenant_id and tenant.active = true
  where attempt.id = p_attempt_id
    and exam.owner_id = auth.uid()
    and exam.tenant_id = (select public.current_tenant_id())
    and attempt.grade_pending = true
  for update of attempt;

  if selected_attempt.id is null then
    raise exception 'Jawaban uraian tidak ditemukan atau sudah dinilai.'
      using errcode = '22023';
  end if;

  select count(*)::integer into essay_total
  from public.online_exam_items as item
  where item.exam_id = selected_attempt.exam_id and item.kind = 'uraian';

  final_score := round(
    (selected_attempt.objective_correct + essay_total * p_essay_score / 100.0)
    * 100.0 / nullif(selected_attempt.objective_total + essay_total, 0),
    2
  );

  update public.online_exam_attempts
  set essay_score = p_essay_score,
    score = final_score,
    grade_pending = false
  where id = selected_attempt.id;

  return final_score;
end;
$$;

create or replace function public.teacher_online_exam_categories()
returns table (exam_id uuid, assessment_type text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) not in (
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
  then
    raise exception 'Hanya guru aktif yang dapat melihat kategori asesmen.'
      using errcode = '42501';
  end if;

  return query
  select exam.id, exam.assessment_type
  from public.online_exams as exam
  where exam.owner_id = auth.uid()
    and exam.tenant_id = (select public.current_tenant_id())
  order by exam.starts_at desc
  limit 100;
end;
$$;

create or replace function public.student_online_exam_categories()
returns table (exam_id uuid, assessment_type text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'siswa'
  then
    raise exception 'Akun siswa aktif diperlukan.'
      using errcode = '42501';
  end if;

  return query
  select exam.id, exam.assessment_type
  from public.student_account_links as link
  join public.students as student
    on student.id = link.student_id and student.tenant_id = link.tenant_id
  join public.online_exams as exam
    on exam.tenant_id = link.tenant_id
   and exam.kelas = student.kelas
   and exam.status = 'active'
  join public.tenants as tenant
    on tenant.id = exam.tenant_id and tenant.active = true
  where link.user_id = auth.uid()
    and exam.ends_at > now()
  order by exam.starts_at, exam.id;
end;
$$;

revoke all on function public.create_typed_online_exam(
  text, text, timestamptz, timestamptz, integer, uuid[], text
) from public, anon;
grant execute on function public.create_typed_online_exam(
  text, text, timestamptz, timestamptz, integer, uuid[], text
) to authenticated, service_role;

revoke all on function public.teacher_online_exam_categories()
  from public, anon;
grant execute on function public.teacher_online_exam_categories()
  to authenticated, service_role;

revoke all on function public.student_online_exam_categories()
  from public, anon;
grant execute on function public.student_online_exam_categories()
  to authenticated, service_role;
