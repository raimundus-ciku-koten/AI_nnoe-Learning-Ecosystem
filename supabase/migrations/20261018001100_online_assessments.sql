create table if not exists public.student_account_links (
  student_id uuid primary key references public.students(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  tenant_id text not null references public.tenants(id) on delete restrict,
  linked_by uuid not null references auth.users(id) on delete restrict,
  linked_at timestamptz not null default now()
);

create table if not exists public.student_account_link_audit (
  id bigint generated always as identity primary key,
  student_id uuid not null,
  user_id uuid not null,
  tenant_id text not null,
  actor_id uuid not null,
  action text not null check (action in ('linked', 'unlinked')),
  occurred_at timestamptz not null default now()
);

create table if not exists public.online_exams (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete restrict,
  kelas text not null check (char_length(kelas) between 1 and 30),
  title text not null check (char_length(title) between 1 and 160),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 1 and 300),
  status text not null default 'active' check (status in ('active', 'closed')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.online_exam_items (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.online_exams(id) on delete cascade,
  position integer not null check (position between 1 and 100),
  kind text not null check (kind in ('pilihan_ganda', 'uraian')),
  prompt text not null check (char_length(prompt) between 1 and 2000),
  choices text[] not null default '{}',
  correct_answer text not null check (char_length(correct_answer) between 1 and 1000),
  unique (exam_id, position)
);

create table if not exists public.online_exam_attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.online_exams(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  started_at timestamptz not null,
  deadline timestamptz not null,
  submitted_at timestamptz,
  submission_id uuid,
  answers jsonb,
  score numeric(5,2),
  objective_correct integer not null default 0 check (objective_correct >= 0),
  objective_total integer not null default 0 check (objective_total >= 0),
  essay_score numeric(5,2) check (essay_score between 0 and 100),
  grade_pending boolean not null default false,
  unique (exam_id, student_id),
  unique (submission_id),
  check ((submitted_at is null) = (submission_id is null)),
  check ((submitted_at is null) = (answers is null))
);

create index if not exists online_exams_tenant_schedule_idx
  on public.online_exams (tenant_id, kelas, starts_at);
create index if not exists online_exam_attempts_student_idx
  on public.online_exam_attempts (student_id, submitted_at);

alter table public.student_account_links enable row level security;
alter table public.student_account_link_audit enable row level security;
alter table public.online_exams enable row level security;
alter table public.online_exam_items enable row level security;
alter table public.online_exam_attempts enable row level security;

revoke all on table public.student_account_links, public.student_account_link_audit, public.online_exams,
  public.online_exam_items, public.online_exam_attempts
  from public, anon, authenticated;
grant all on table public.student_account_links, public.student_account_link_audit, public.online_exams,
  public.online_exam_items, public.online_exam_attempts to service_role;

create or replace function public.link_student_account(
  p_student_id uuid,
  p_student_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  student_tenant text;
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'admin_sekolah'
  then
    raise exception 'Hanya admin sekolah aktif yang dapat menautkan akun siswa.'
      using errcode = '42501';
  end if;

  select student.tenant_id
    into student_tenant
  from public.students as student
  join public.tenants as tenant on tenant.id = student.tenant_id and tenant.active = true
  where student.id = p_student_id
    and student.tenant_id = (select public.current_tenant_id())
  for update of student;

  if student_tenant is null or not exists (
    select 1
    from public.profiles as profile
    where profile.id = p_student_user_id
      and profile.tenant_id = student_tenant
      and profile.role = 'siswa'
      and profile.active = true
  ) then
    raise exception 'Roster dan akun siswa harus aktif pada sekolah yang sama.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.online_exam_attempts as attempt
    where attempt.student_id = p_student_id
  ) then
    raise exception 'Identitas roster tidak dapat diubah setelah ada sesi ujian.'
      using errcode = '22023';
  end if;

  insert into public.student_account_links (student_id, user_id, tenant_id, linked_by)
  values (p_student_id, p_student_user_id, student_tenant, auth.uid());

  insert into public.student_account_link_audit (student_id, user_id, tenant_id, actor_id, action)
  values (p_student_id, p_student_user_id, student_tenant, auth.uid(), 'linked');
end;
$$;

create or replace function public.unlinked_student_roster()
returns table (student_id uuid, nama text, kelas text, nisn_tail text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'admin_sekolah'
  then
    raise exception 'Hanya admin sekolah aktif yang dapat melihat roster untuk penautan.'
      using errcode = '42501';
  end if;

  return query
  select student.id, student.nama, student.kelas, right(student.nisn, 4)
  from public.students as student
  join public.tenants as tenant on tenant.id = student.tenant_id and tenant.active = true
  left join public.student_account_links as link on link.student_id = student.id
  where student.tenant_id = (select public.current_tenant_id())
    and link.student_id is null
  order by student.kelas, student.nama;
end;
$$;

create or replace function public.unlinked_student_accounts()
returns table (user_id uuid, email text, nama text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'admin_sekolah'
  then
    raise exception 'Hanya admin sekolah aktif yang dapat melihat akun siswa untuk penautan.'
      using errcode = '42501';
  end if;

  return query
  select profile.id, profile.email, profile.nama
  from public.profiles as profile
  join public.tenants as tenant on tenant.id = profile.tenant_id and tenant.active = true
  left join public.student_account_links as link on link.user_id = profile.id
  where profile.tenant_id = (select public.current_tenant_id())
    and profile.role = 'siswa'
    and profile.active = true
    and link.user_id is null
  order by profile.nama, profile.email;
end;
$$;

create or replace function public.linked_student_accounts()
returns table (
  student_id uuid,
  nama text,
  kelas text,
  user_id uuid,
  email text,
  user_nama text,
  linked_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'admin_sekolah'
  then
    raise exception 'Hanya admin sekolah aktif yang dapat melihat penautan akun siswa.'
      using errcode = '42501';
  end if;

  return query
  select student.id, student.nama, student.kelas, link.user_id,
    profile.email, profile.nama, link.linked_at
  from public.student_account_links as link
  join public.students as student on student.id = link.student_id
  join public.profiles as profile on profile.id = link.user_id
  join public.tenants as tenant on tenant.id = link.tenant_id and tenant.active = true
  where link.tenant_id = (select public.current_tenant_id())
  order by student.kelas, student.nama;
end;
$$;

create or replace function public.unlink_student_account(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed_link public.student_account_links%rowtype;
  linked_student uuid;
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'admin_sekolah'
  then
    raise exception 'Hanya admin sekolah aktif yang dapat melepas tautan akun siswa.'
      using errcode = '42501';
  end if;

  select link.student_id
    into linked_student
  from public.student_account_links as link
  join public.students as student on student.id = link.student_id
  where link.student_id = p_student_id
    and link.tenant_id = (select public.current_tenant_id())
  for update of link, student;

  if linked_student is null then
    raise exception 'Tautan akun siswa tidak ditemukan pada sekolah ini.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.online_exam_attempts as attempt
    where attempt.student_id = linked_student
  ) then
    raise exception 'Tautan tidak dapat dilepas setelah siswa memiliki sesi ujian.'
      using errcode = '22023';
  end if;

  delete from public.student_account_links as link
  where link.student_id = p_student_id
    and link.tenant_id = (select public.current_tenant_id())
  returning link.* into removed_link;

  if removed_link.student_id is null then
    raise exception 'Tautan akun siswa tidak ditemukan pada sekolah ini.'
      using errcode = '22023';
  end if;

  insert into public.student_account_link_audit (student_id, user_id, tenant_id, actor_id, action)
  values (removed_link.student_id, removed_link.user_id, removed_link.tenant_id, auth.uid(), 'unlinked');
end;
$$;

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
    or (select public.current_app_role()) <> 'guru'
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
    from public.question_bank as question
    where question.id = any (p_question_ids)
      and question.tenant_id = (select public.current_tenant_id())
      and question.owner_id = auth.uid()
      and question.kelas = btrim(p_kelas)
  ) <> cardinality(p_question_ids) then
    raise exception 'Semua soal harus dimiliki guru dan sesuai kelas ujian.'
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

create or replace function public.student_online_exams()
returns table (
  exam_id uuid,
  title text,
  kelas text,
  starts_at timestamptz,
  ends_at timestamptz,
  duration_minutes integer,
  attempt_status text
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
    raise exception 'Akun siswa aktif diperlukan.'
      using errcode = '42501';
  end if;

  return query
  select exam.id, exam.title, exam.kelas, exam.starts_at, exam.ends_at,
    exam.duration_minutes,
    case
      when attempt.submitted_at is not null then 'submitted'
      when attempt.id is not null then 'in_progress'
      else 'not_started'
    end
  from public.student_account_links as link
  join public.students as student
    on student.id = link.student_id and student.tenant_id = link.tenant_id
  join public.online_exams as exam
    on exam.tenant_id = link.tenant_id
    and exam.kelas = student.kelas
    and exam.status = 'active'
  left join public.online_exam_attempts as attempt
    on attempt.exam_id = exam.id and attempt.student_id = student.id
  join public.tenants as tenant on tenant.id = exam.tenant_id and tenant.active = true
  where link.user_id = auth.uid()
    and exam.ends_at > now()
  order by exam.starts_at, exam.id;
end;
$$;

create or replace function public.start_student_online_exam(p_exam_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_exam public.online_exams%rowtype;
  selected_student uuid;
  selected_attempt public.online_exam_attempts%rowtype;
  response jsonb;
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'siswa'
  then
    raise exception 'Akun siswa aktif diperlukan.'
      using errcode = '42501';
  end if;

  select student.id
    into selected_student
  from public.student_account_links as link
  join public.students as student
    on student.id = link.student_id and student.tenant_id = link.tenant_id
  where link.user_id = auth.uid()
  for update of link, student;

  if selected_student is null then
    raise exception 'Akun siswa belum ditautkan ke roster sekolah.'
      using errcode = '42501';
  end if;

  select exam.*
    into selected_exam
  from public.online_exams as exam
  join public.students as student
    on student.id = selected_student
    and student.tenant_id = exam.tenant_id
    and student.kelas = exam.kelas
  join public.tenants as tenant on tenant.id = exam.tenant_id and tenant.active = true
  where exam.id = p_exam_id and exam.status = 'active';

  if selected_exam.id is null or now() < selected_exam.starts_at
    or now() >= selected_exam.ends_at
  then
    raise exception 'Ujian belum dibuka atau sudah ditutup.'
      using errcode = '22023';
  end if;

  insert into public.online_exam_attempts (exam_id, student_id, started_at, deadline)
  values (
    selected_exam.id,
    selected_student,
    now(),
    least(now() + make_interval(mins => selected_exam.duration_minutes), selected_exam.ends_at)
  )
  on conflict (exam_id, student_id) do nothing;

  select attempt.*
    into selected_attempt
  from public.online_exam_attempts as attempt
  where attempt.exam_id = selected_exam.id and attempt.student_id = selected_student;

  if selected_attempt.submitted_at is not null then
    raise exception 'Ujian ini sudah dikumpulkan.'
      using errcode = '22023';
  end if;

  select jsonb_build_object(
    'examId', selected_exam.id,
    'attemptId', selected_attempt.id,
    'title', selected_exam.title,
    'deadline', selected_attempt.deadline,
    'questions', coalesce(jsonb_agg(
      jsonb_build_object(
        'id', item.id,
        'kind', item.kind,
        'prompt', item.prompt,
        'choices', item.choices,
        'position', item.position
      ) order by item.position
    ), '[]'::jsonb)
  )
  into response
  from public.online_exam_items as item
  where item.exam_id = selected_exam.id;

  return response;
end;
$$;

create or replace function public.submit_student_online_exam(
  p_attempt_id uuid,
  p_submission_id uuid,
  p_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_attempt public.online_exam_attempts%rowtype;
  selected_student uuid;
  v_objective_total integer;
  v_objective_correct integer;
  v_essay_total integer;
  has_essay boolean;
  v_final_score numeric(5,2);
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'siswa'
  then
    raise exception 'Akun siswa aktif diperlukan.'
      using errcode = '42501';
  end if;

  if p_submission_id is null or p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'Format pengumpulan jawaban tidak valid.'
      using errcode = '22023';
  end if;

  select student.id
    into selected_student
  from public.student_account_links as link
  join public.students as student
    on student.id = link.student_id and student.tenant_id = link.tenant_id
  where link.user_id = auth.uid();

  select attempt.*
    into selected_attempt
  from public.online_exam_attempts as attempt
  where attempt.id = p_attempt_id and attempt.student_id = selected_student
  for update;

  if selected_attempt.id is null then
    raise exception 'Sesi ujian tidak ditemukan.'
      using errcode = '42501';
  end if;

  if selected_attempt.submitted_at is not null then
    if selected_attempt.submission_id <> p_submission_id then
      raise exception 'Ujian telah dikumpulkan dengan ID pengumpulan yang berbeda.'
        using errcode = '22023';
    end if;
    return jsonb_build_object(
      'submitted', true,
      'gradePending', selected_attempt.grade_pending
    );
  end if;

  if now() >= selected_attempt.deadline then
    raise exception 'Waktu ujian telah berakhir.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_each(p_answers) as answer(question_id, value)
    where jsonb_typeof(answer.value) <> 'string'
      or char_length(answer.value #>> '{}') > 1000
      or not exists (
        select 1
        from public.online_exam_items as item
        where item.exam_id = selected_attempt.exam_id
          and item.id::text = answer.question_id
      )
  ) then
    raise exception 'Jawaban berisi soal yang tidak termasuk dalam ujian.'
      using errcode = '22023';
  end if;

  select count(*)::integer,
    count(*) filter (
      where p_answers ->> item.id::text = item.correct_answer
    )::integer
  into v_objective_total, v_objective_correct
  from public.online_exam_items as item
  where item.exam_id = selected_attempt.exam_id
    and item.kind = 'pilihan_ganda';

  select count(*)::integer
    into v_essay_total
  from public.online_exam_items as item
  where item.exam_id = selected_attempt.exam_id and item.kind = 'uraian';

  has_essay := v_essay_total > 0;

  v_final_score := case
    when has_essay then null
    when v_objective_total = 0 then null
    else round(v_objective_correct * 100.0 / v_objective_total, 2)
  end;

  update public.online_exam_attempts
  set submitted_at = now(),
    submission_id = p_submission_id,
    answers = p_answers,
    score = v_final_score,
    objective_correct = v_objective_correct,
    objective_total = v_objective_total,
    grade_pending = has_essay
  where id = selected_attempt.id;

  return jsonb_build_object(
    'submitted', true,
    'gradePending', has_essay
  );
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
    or (select public.current_app_role()) <> 'guru'
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

create or replace function public.student_online_exam_results()
returns table (
  exam_id uuid,
  title text,
  kelas text,
  submitted_at timestamptz,
  score numeric,
  grade_pending boolean
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
    raise exception 'Akun siswa aktif diperlukan.'
      using errcode = '42501';
  end if;

  return query
  select exam.id, exam.title, exam.kelas, attempt.submitted_at,
    case when attempt.grade_pending then null else attempt.score end,
    attempt.grade_pending
  from public.student_account_links as link
  join public.students as student on student.id = link.student_id and student.tenant_id = link.tenant_id
  join public.online_exam_attempts as attempt on attempt.student_id = student.id
  join public.online_exams as exam on exam.id = attempt.exam_id and exam.tenant_id = student.tenant_id
  join public.tenants as tenant on tenant.id = exam.tenant_id and tenant.active = true
  where link.user_id = auth.uid()
    and attempt.submitted_at is not null
    and exam.ends_at <= now()
  order by attempt.submitted_at desc, exam.id;
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
    or (select public.current_app_role()) <> 'guru'
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
    or (select public.current_app_role()) <> 'guru'
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
    or (select public.current_app_role()) <> 'guru'
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

revoke all on function public.link_student_account(uuid, uuid)
  from public, anon;
revoke all on function public.unlinked_student_roster()
  from public, anon;
revoke all on function public.unlinked_student_accounts()
  from public, anon;
revoke all on function public.linked_student_accounts()
  from public, anon;
revoke all on function public.unlink_student_account(uuid)
  from public, anon;
revoke all on function public.create_online_exam(text, text, timestamptz, timestamptz, integer, uuid[])
  from public, anon;
revoke all on function public.student_online_exams()
  from public, anon;
revoke all on function public.start_student_online_exam(uuid)
  from public, anon;
revoke all on function public.submit_student_online_exam(uuid, uuid, jsonb)
  from public, anon;
revoke all on function public.teacher_online_exam_overview()
  from public, anon;
revoke all on function public.teacher_online_exam_results()
  from public, anon;
revoke all on function public.student_online_exam_results()
  from public, anon;
revoke all on function public.teacher_online_exam_essay_reviews()
  from public, anon;
revoke all on function public.review_online_exam_essays(uuid, numeric)
  from public, anon;
grant execute on function public.link_student_account(uuid, uuid),
  public.unlinked_student_roster(),
  public.unlinked_student_accounts(),
  public.linked_student_accounts(),
  public.unlink_student_account(uuid),
  public.create_online_exam(text, text, timestamptz, timestamptz, integer, uuid[]),
  public.student_online_exams(),
  public.start_student_online_exam(uuid),
  public.submit_student_online_exam(uuid, uuid, jsonb),
  public.teacher_online_exam_overview(),
  public.teacher_online_exam_results(),
  public.student_online_exam_results(),
  public.teacher_online_exam_essay_reviews(),
  public.review_online_exam_essays(uuid, numeric)
  to authenticated;
