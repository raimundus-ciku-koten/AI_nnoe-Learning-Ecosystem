create table if not exists public.online_exam_recipients (
  exam_id uuid not null references public.online_exams(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  tenant_id text not null references public.tenants(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (exam_id, student_id)
);

alter table public.online_exam_recipients enable row level security;
revoke all on table public.online_exam_recipients from public, anon, authenticated;
grant all on table public.online_exam_recipients to service_role;

create or replace function public.block_unassigned_exam_attempt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.online_exam_recipients as recipient
    where recipient.exam_id = new.exam_id
  ) and not exists (
    select 1
    from public.online_exam_recipients as recipient
    where recipient.exam_id = new.exam_id
      and recipient.student_id = new.student_id
  ) then
    raise exception 'Ujian ini tidak ditujukan untuk akun siswa Anda.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.school_exam_available_classes()
returns table (kelas text, student_count integer, linked_count integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'admin_sekolah'
    or (select public.current_tenant_id()) = '' then
    raise exception 'Hanya admin sekolah aktif yang dapat melihat daftar kelas ujian.'
      using errcode = '42501';
  end if;
  return query
  select student.kelas, count(*)::integer,
    count(link.student_id)::integer
  from public.students as student
  join public.tenants as tenant on tenant.id = student.tenant_id and tenant.active = true
  left join public.student_account_links as link
    on link.student_id = student.id and link.tenant_id = student.tenant_id
  where student.tenant_id = (select public.current_tenant_id())
  group by student.kelas
  order by student.kelas;
end;
$$;

drop trigger if exists online_exam_attempt_recipient_guard on public.online_exam_attempts;
create trigger online_exam_attempt_recipient_guard
  before insert or update of exam_id, student_id
  on public.online_exam_attempts
  for each row execute function public.block_unassigned_exam_attempt();

create or replace function public.school_exam_student_roster(p_kelas text[])
returns table (student_id uuid, nama text, kelas text, account_linked boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'admin_sekolah'
    or (select public.current_tenant_id()) = '' then
    raise exception 'Hanya admin sekolah aktif yang dapat memilih peserta ujian.'
      using errcode = '42501';
  end if;

  if p_kelas is null or cardinality(p_kelas) not between 1 and 100
    or array_position(p_kelas, null) is not null then
    raise exception 'Daftar kelas tidak valid.' using errcode = '22023';
  end if;

  return query
  select student.id, student.nama, student.kelas, link.student_id is not null
  from public.students as student
  join public.tenants as tenant on tenant.id = student.tenant_id and tenant.active = true
  left join public.student_account_links as link
    on link.student_id = student.id and link.tenant_id = student.tenant_id
  where student.tenant_id = (select public.current_tenant_id())
    and student.kelas = any (p_kelas)
  order by student.kelas, student.nama, student.id;
end;
$$;

create or replace function public.create_school_online_exams_v2(
  p_title text,
  p_kelas text[],
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_duration_minutes integer,
  p_question_ids uuid[],
  p_custom_questions jsonb,
  p_student_ids uuid[],
  p_reviewer_teacher_id uuid
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_class text;
  new_exam_id uuid;
  exam_owner uuid;
  created_exam_ids uuid[] := array[]::uuid[];
  question_count integer;
  custom_question jsonb;
  question_choices jsonb;
  question_kind text;
  question_prompt text;
  question_answer text;
  question_mapel text;
  question_kelas text;
  has_essay boolean;
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'admin_sekolah'
    or (select public.current_tenant_id()) = '' then
    raise exception 'Hanya admin sekolah aktif yang dapat membuat ujian sekolah.'
      using errcode = '42501';
  end if;

  if p_title is null or char_length(btrim(p_title)) not between 1 and 160
    or p_kelas is null or cardinality(p_kelas) not between 1 and 100
    or array_position(p_kelas, null) is not null
    or p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at
    or p_duration_minutes not between 1 and 300
    or p_question_ids is null or cardinality(p_question_ids) > 500
    or array_position(p_question_ids, null) is not null
    or p_custom_questions is null or jsonb_typeof(p_custom_questions) <> 'array'
    or jsonb_array_length(p_custom_questions) > 500
    or p_student_ids is null or cardinality(p_student_ids) > 2000
    or array_position(p_student_ids, null) is not null then
    raise exception 'Pengaturan ujian sekolah tidak valid.' using errcode = '22023';
  end if;

  if cardinality(p_question_ids) + jsonb_array_length(p_custom_questions) < 1 then
    raise exception 'Pilih setidaknya satu soal.' using errcode = '22023';
  end if;

  if exists (
    select 1 from unnest(p_kelas) as selected(kelas)
    where char_length(btrim(selected.kelas)) not between 1 and 30
      or btrim(selected.kelas) <> selected.kelas
  ) or (
    select count(distinct selected.kelas)
    from unnest(p_kelas) as selected(kelas)
  ) <> cardinality(p_kelas) then
    raise exception 'Daftar kelas tidak valid atau berisi duplikasi.' using errcode = '22023';
  end if;

  if cardinality(p_question_ids) > 0 and (
    select count(distinct selected.question_id)
    from unnest(p_question_ids) as selected(question_id)
  ) <> cardinality(p_question_ids) then
    raise exception 'Daftar soal tidak boleh berisi duplikasi.' using errcode = '22023';
  end if;

  if cardinality(p_student_ids) > 0 and (
    select count(distinct selected.student_id)
    from unnest(p_student_ids) as selected(student_id)
  ) <> cardinality(p_student_ids) then
    raise exception 'Daftar siswa tidak boleh berisi duplikasi.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.tenants as tenant
    where tenant.id = (select public.current_tenant_id()) and tenant.active = true
  ) then
    raise exception 'Sekolah tidak aktif.' using errcode = '42501';
  end if;

  if cardinality(p_question_ids) > 0 and (
    select count(*)
    from public.question_bank as question
    where question.id = any (p_question_ids)
      and question.tenant_id = (select public.current_tenant_id())
      and question.kelas = any (p_kelas)
  ) <> cardinality(p_question_ids) then
    raise exception 'Soal bank harus berasal dari tenant dan kelas yang dipilih.'
      using errcode = '42501';
  end if;

  for custom_question in select value from jsonb_array_elements(p_custom_questions)
  loop
    question_kind := custom_question->>'jenis';
    question_prompt := custom_question->>'pertanyaan';
    question_answer := custom_question->>'jawaban';
    question_mapel := custom_question->>'mapel';
    question_kelas := custom_question->>'kelas';
    question_choices := custom_question->'pilihan';
    if jsonb_typeof(custom_question) <> 'object'
      or not (custom_question ?& array['mapel', 'kelas', 'jenis', 'pertanyaan', 'pilihan', 'jawaban'])
      or jsonb_typeof(question_choices) is distinct from 'array'
      or question_kelas is null or not (question_kelas = any (p_kelas))
      or question_mapel is null or char_length(btrim(question_mapel)) not between 1 and 80
      or question_kind is null or question_kind not in ('pilihan_ganda', 'uraian')
      or question_prompt is null or char_length(btrim(question_prompt)) not between 1 and 2000
      or question_answer is null or char_length(btrim(question_answer)) not between 1 and 1000 then
      raise exception 'Draf soal PDF tidak valid atau tidak sesuai kelas.' using errcode = '22023';
    end if;
    if question_kind = 'pilihan_ganda' then
      if jsonb_array_length(question_choices) not between 2 and 5
        or exists (select 1 from jsonb_array_elements_text(question_choices) as choice(value)
          where char_length(btrim(choice.value)) not between 1 and 300)
        or exists (select 1 from jsonb_array_elements(question_choices) as choice(value)
          where jsonb_typeof(choice.value) <> 'string')
        or (select count(distinct choice.value) from jsonb_array_elements_text(question_choices) as choice(value))
          <> jsonb_array_length(question_choices)
        or not exists (select 1 from jsonb_array_elements_text(question_choices) as choice(value)
          where choice.value = question_answer) then
        raise exception 'Pilihan atau kunci jawaban draf tidak valid.' using errcode = '22023';
      end if;
    elsif jsonb_array_length(question_choices) <> 0 then
      raise exception 'Soal uraian tidak boleh memiliki pilihan.' using errcode = '22023';
    end if;
  end loop;

  if cardinality(p_student_ids) > 0 and (
    select count(*)
    from public.students as student
    join public.student_account_links as link
      on link.student_id = student.id and link.tenant_id = student.tenant_id
    where student.id = any (p_student_ids)
      and student.tenant_id = (select public.current_tenant_id())
      and student.kelas = any (p_kelas)
  ) <> cardinality(p_student_ids) then
    raise exception 'Peserta harus tertaut ke akun aktif dalam tenant dan kelas ujian.'
      using errcode = '42501';
  end if;

  if p_reviewer_teacher_id is not null and not exists (
    select 1 from public.profiles as profile
    where profile.id = p_reviewer_teacher_id
      and profile.tenant_id = (select public.current_tenant_id())
      and profile.active = true
      and profile.role in ('guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler')
  ) then
    raise exception 'Guru penilai harus aktif dan berasal dari tenant sekolah.'
      using errcode = '42501';
  end if;

  if p_reviewer_teacher_id is not null and exists (
    select 1 from unnest(p_kelas) as selected(kelas)
    join public.profiles as profile on profile.id = p_reviewer_teacher_id
    where not (selected.kelas = any(profile.kelas_ids))
  ) then
    raise exception 'Guru penilai harus ditugaskan ke semua kelas ujian.'
      using errcode = '42501';
  end if;

  select exists (
    select 1 from public.question_bank as question
    where question.id = any (p_question_ids) and question.jenis = 'uraian'
  ) or exists (
    select 1 from jsonb_array_elements(p_custom_questions) as q(value)
    where q.value->>'jenis' = 'uraian'
  ) into has_essay;

  if has_essay and p_reviewer_teacher_id is null then
    raise exception 'Pilih guru penilai untuk ujian yang memuat soal uraian.'
      using errcode = '22023';
  end if;
  exam_owner := coalesce(p_reviewer_teacher_id, auth.uid());

  foreach selected_class in array p_kelas loop
    select
      (select count(*) from public.question_bank as question
        where question.id = any (p_question_ids)
          and question.tenant_id = (select public.current_tenant_id())
          and question.kelas = selected_class)
      +
      (select count(*) from jsonb_array_elements(p_custom_questions) as q(value)
        where q.value->>'kelas' = selected_class)
      into question_count;
    if question_count not between 1 and 100 then
      raise exception 'Setiap kelas harus memiliki 1 sampai 100 soal.' using errcode = '22023';
    end if;
    if cardinality(p_student_ids) > 0 and not exists (
      select 1 from public.students as student
      where student.id = any (p_student_ids)
        and student.tenant_id = (select public.current_tenant_id())
        and student.kelas = selected_class
    ) then
      raise exception 'Pilih minimal satu peserta untuk setiap kelas terpilih.' using errcode = '22023';
    end if;

    insert into public.online_exams (
      tenant_id, owner_id, kelas, title, starts_at, ends_at, duration_minutes
    ) values (
      (select public.current_tenant_id()), exam_owner, selected_class,
      left(btrim(p_title) || ' - ' || selected_class, 160),
      p_starts_at, p_ends_at, p_duration_minutes
    ) returning id into new_exam_id;

    insert into public.online_exam_items (
      exam_id, position, kind, prompt, choices, correct_answer
    )
    select new_exam_id, row_number() over (order by item.ordinality)::integer,
      item.kind, item.prompt, item.choices, item.answer
    from (
      select selected.ordinality, question.jenis as kind, question.pertanyaan as prompt,
        question.pilihan as choices, question.jawaban as answer
      from unnest(p_question_ids) with ordinality as selected(question_id, ordinality)
      join public.question_bank as question
        on question.id = selected.question_id
        and question.tenant_id = (select public.current_tenant_id())
        and question.kelas = selected_class
      union all
      select cardinality(p_question_ids) + selected.ordinality,
        selected.value->>'jenis', selected.value->>'pertanyaan',
        array(select jsonb_array_elements_text(selected.value->'pilihan')),
        selected.value->>'jawaban'
      from jsonb_array_elements(p_custom_questions) with ordinality as selected(value, ordinality)
      where selected.value->>'kelas' = selected_class
    ) as item;

    if cardinality(p_student_ids) > 0 then
      insert into public.online_exam_recipients (exam_id, student_id, tenant_id)
      select new_exam_id, student.id, student.tenant_id
      from public.students as student
      where student.id = any (p_student_ids)
        and student.tenant_id = (select public.current_tenant_id())
        and student.kelas = selected_class;
    end if;
    created_exam_ids := array_append(created_exam_ids, new_exam_id);
  end loop;

  return created_exam_ids;
end;
$$;

create or replace function public.create_teacher_online_exam_from_questions(
  p_title text,
  p_kelas text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_duration_minutes integer,
  p_question_ids uuid[],
  p_custom_questions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_exam_id uuid;
  teacher_profile public.profiles%rowtype;
  selected_question jsonb;
  choices jsonb;
  kind text;
  prompt text;
  answer text;
  subject text;
  question_class text;
begin
  if auth.uid() is null or not (select public.current_user_is_active())
    or (select public.current_app_role()) not in ('guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler') then
    raise exception 'Hanya guru aktif yang dapat membuat ujian.' using errcode = '42501';
  end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 160
    or p_kelas is null or char_length(btrim(p_kelas)) not between 1 and 30
    or p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at
    or p_duration_minutes not between 1 and 300
    or p_question_ids is null or cardinality(p_question_ids) > 100
    or array_position(p_question_ids, null) is not null
    or p_custom_questions is null or jsonb_typeof(p_custom_questions) is distinct from 'array'
    or jsonb_array_length(p_custom_questions) > 100 then
    raise exception 'Pengaturan ujian tidak valid.' using errcode = '22023';
  end if;
  if cardinality(p_question_ids) + jsonb_array_length(p_custom_questions) not between 1 and 100 then
    raise exception 'Pilih 1 sampai 100 soal untuk ujian.' using errcode = '22023';
  end if;
  if cardinality(p_question_ids) > 0 and (
    select count(distinct selected.question_id)
    from unnest(p_question_ids) as selected(question_id)
  ) <> cardinality(p_question_ids) then
    raise exception 'Daftar soal tidak boleh berisi duplikasi.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.tenants as tenant
    where tenant.id = (select public.current_tenant_id()) and tenant.active = true) then
    raise exception 'Sekolah tidak aktif.' using errcode = '42501';
  end if;
  select profile.* into teacher_profile
  from public.profiles as profile
  where profile.id = auth.uid()
    and profile.tenant_id = (select public.current_tenant_id())
    and profile.active = true;
  if not found then
    raise exception 'Profil guru tidak aktif pada tenant ini.' using errcode = '42501';
  end if;
  if not (btrim(p_kelas) = any(teacher_profile.kelas_ids)) then
    raise exception 'Guru tidak ditugaskan ke kelas ini.' using errcode = '42501';
  end if;
  if cardinality(p_question_ids) > 0 and (
    select count(*) from public.question_bank as question
    where question.id = any(p_question_ids)
      and question.tenant_id = (select public.current_tenant_id())
      and question.owner_id = auth.uid()
      and question.kelas = btrim(p_kelas)
      and question.mapel = any(teacher_profile.mapel_ids)
  ) <> cardinality(p_question_ids) then
    raise exception 'Soal bank harus dimiliki guru dan sesuai kelas serta mata pelajaran.' using errcode = '42501';
  end if;
  for selected_question in select value from jsonb_array_elements(p_custom_questions)
  loop
    kind := selected_question->>'jenis';
    prompt := selected_question->>'pertanyaan';
    answer := selected_question->>'jawaban';
    subject := selected_question->>'mapel';
    question_class := selected_question->>'kelas';
    choices := selected_question->'pilihan';
    if jsonb_typeof(selected_question) <> 'object'
      or jsonb_typeof(choices) is distinct from 'array'
      or subject is null or char_length(btrim(subject)) not between 1 and 80
      or btrim(subject) <> subject or not (subject = any(teacher_profile.mapel_ids))
      or question_class is distinct from btrim(p_kelas)
      or kind is null or kind not in ('pilihan_ganda', 'uraian')
      or prompt is null or char_length(btrim(prompt)) not between 1 and 2000
      or answer is null or char_length(btrim(answer)) not between 1 and 1000 then
      raise exception 'Draf soal tidak valid atau di luar penugasan guru.' using errcode = '22023';
    end if;
    if kind = 'pilihan_ganda' and (jsonb_array_length(choices) not between 2 and 5
      or exists (select 1 from jsonb_array_elements(choices) as choice(value)
        where jsonb_typeof(choice.value) <> 'string')
      or exists (select 1 from jsonb_array_elements_text(choices) as choice(value)
        where char_length(btrim(choice.value)) not between 1 and 300)
      or (select count(distinct choice.value) from jsonb_array_elements_text(choices) as choice(value))
        <> jsonb_array_length(choices)
      or not exists (select 1 from jsonb_array_elements_text(choices) as choice(value) where choice.value = answer)) then
      raise exception 'Pilihan dan kunci jawaban tidak cocok.' using errcode = '22023';
    elsif kind = 'uraian' and jsonb_array_length(choices) <> 0 then
      raise exception 'Soal uraian tidak boleh memiliki pilihan.' using errcode = '22023';
    end if;
  end loop;

  insert into public.online_exams (tenant_id, owner_id, kelas, title, starts_at, ends_at, duration_minutes)
  values ((select public.current_tenant_id()), auth.uid(), btrim(p_kelas), btrim(p_title),
    p_starts_at, p_ends_at, p_duration_minutes)
  returning id into new_exam_id;
  insert into public.online_exam_items (exam_id, position, kind, prompt, choices, correct_answer)
  select new_exam_id, item.ordinality::integer, item.kind, item.prompt, item.choices, item.answer
  from (
    select selected.ordinality, question.jenis as kind, question.pertanyaan as prompt,
      question.pilihan as choices, question.jawaban as answer
    from unnest(p_question_ids) with ordinality as selected(question_id, ordinality)
    join public.question_bank as question
      on question.id = selected.question_id
      and question.tenant_id = (select public.current_tenant_id())
      and question.owner_id = auth.uid()
    union all
    select cardinality(p_question_ids) + selected.ordinality,
      selected.value->>'jenis', selected.value->>'pertanyaan',
      array(select jsonb_array_elements_text(selected.value->'pilihan')),
      selected.value->>'jawaban'
    from jsonb_array_elements(p_custom_questions) with ordinality as selected(value, ordinality)
  ) as item;
  return new_exam_id;
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
begin
  return public.create_teacher_online_exam_from_questions(
    p_title,
    p_kelas,
    p_starts_at,
    p_ends_at,
    p_duration_minutes,
    p_question_ids,
    '[]'::jsonb
  );
end;
$$;

create or replace function public.student_online_exams()
returns table (
  exam_id uuid, title text, kelas text, starts_at timestamptz,
  ends_at timestamptz, duration_minutes integer, attempt_status text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'siswa' then
    raise exception 'Akun siswa aktif diperlukan.' using errcode = '42501';
  end if;
  return query
  select exam.id, exam.title, exam.kelas, exam.starts_at, exam.ends_at, exam.duration_minutes,
    case when attempt.submitted_at is not null then 'submitted'
      when attempt.id is not null then 'in_progress' else 'not_started' end
  from public.student_account_links as link
  join public.students as student on student.id = link.student_id and student.tenant_id = link.tenant_id
  join public.online_exams as exam on exam.tenant_id = link.tenant_id
    and exam.kelas = student.kelas and exam.status = 'active'
  left join public.online_exam_attempts as attempt
    on attempt.exam_id = exam.id and attempt.student_id = student.id
  join public.tenants as tenant on tenant.id = exam.tenant_id and tenant.active = true
  where link.user_id = auth.uid() and exam.ends_at > now()
    and (not exists (select 1 from public.online_exam_recipients as recipient where recipient.exam_id = exam.id)
      or exists (select 1 from public.online_exam_recipients as recipient
        where recipient.exam_id = exam.id and recipient.student_id = student.id))
  order by exam.starts_at, exam.id;
end;
$$;

create or replace function public.school_admin_online_exam_overview()
returns table (
  exam_id uuid, title text, kelas text, starts_at timestamptz, ends_at timestamptz,
  duration_minutes integer, status text, teacher_name text,
  participant_count integer, attempt_count integer, submitted_count integer, pending_review_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'admin_sekolah'
    or (select public.current_tenant_id()) = '' then
    raise exception 'Hanya admin sekolah aktif yang dapat melihat ringkasan ujian tenant.' using errcode = '42501';
  end if;
  return query
  select exam.id, exam.title, exam.kelas, exam.starts_at, exam.ends_at, exam.duration_minutes,
    exam.status, coalesce(profile.nama, 'Guru')::text,
    count(distinct student.id)::integer,
    count(distinct attempt.id)::integer,
    (count(distinct attempt.id) filter (where attempt.submitted_at is not null))::integer,
    (count(distinct attempt.id) filter (where attempt.grade_pending))::integer
  from public.online_exams as exam
  join public.tenants as tenant on tenant.id = exam.tenant_id and tenant.active = true
  left join public.profiles as profile on profile.id = exam.owner_id and profile.tenant_id = exam.tenant_id
  left join public.students as student on student.tenant_id = exam.tenant_id and student.kelas = exam.kelas
  left join public.student_account_links as link on link.student_id = student.id and link.tenant_id = exam.tenant_id
  left join public.online_exam_recipients as recipient
    on recipient.exam_id = exam.id and recipient.student_id = student.id
  left join public.online_exam_attempts as attempt
    on attempt.exam_id = exam.id and attempt.student_id = student.id
  where exam.tenant_id = (select public.current_tenant_id())
    and (not exists (select 1 from public.online_exam_recipients as target where target.exam_id = exam.id)
      or recipient.student_id is not null)
    and link.student_id is not null
  group by exam.id, profile.nama
  order by exam.starts_at desc, exam.id;
end;
$$;

revoke all on function public.block_unassigned_exam_attempt() from public, anon;
revoke all on function public.school_exam_student_roster(text[]) from public, anon;
revoke all on function public.school_exam_available_classes() from public, anon;
revoke all on function public.create_school_online_exams_v2(text, text[], timestamptz, timestamptz, integer, uuid[], jsonb, uuid[], uuid) from public, anon;
revoke all on function public.create_teacher_online_exam_from_questions(text, text, timestamptz, timestamptz, integer, uuid[], jsonb) from public, anon;
revoke all on function public.create_online_exam(text, text, timestamptz, timestamptz, integer, uuid[]) from public, anon;
revoke all on function public.student_online_exams() from public, anon;
revoke all on function public.school_admin_online_exam_overview() from public, anon;
grant execute on function public.school_exam_student_roster(text[]),
  public.school_exam_available_classes(),
  public.create_school_online_exams_v2(text, text[], timestamptz, timestamptz, integer, uuid[], jsonb, uuid[], uuid),
  public.create_teacher_online_exam_from_questions(text, text, timestamptz, timestamptz, integer, uuid[], jsonb),
  public.create_online_exam(text, text, timestamptz, timestamptz, integer, uuid[]),
  public.student_online_exams(), public.school_admin_online_exam_overview()
  to authenticated;