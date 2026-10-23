create table if not exists public.school_task_submissions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.school_learning_items(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  tenant_id text not null references public.tenants(id) on delete restrict,
  answer text not null check (
    char_length(answer) between 1 and 10000
    and answer = btrim(answer)
  ),
  submitted_at timestamptz not null default now(),
  feedback text check (
    feedback is null or (
      char_length(feedback) <= 5000
      and feedback = btrim(feedback)
    )
  ),
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  unique (task_id, student_id),
  check (
    (reviewed_by is null and reviewed_at is null)
    or (reviewed_by is not null and reviewed_at is not null)
  )
);

create index if not exists school_task_submissions_tenant_task_idx
  on public.school_task_submissions (tenant_id, task_id, submitted_at);

alter table public.school_task_submissions enable row level security;

revoke all on table public.school_task_submissions from public, anon, authenticated;
grant all on table public.school_task_submissions to service_role;

create or replace function public.submit_school_task(
  p_task_id uuid,
  p_answer text
)
returns table (submission_id uuid, submitted_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_task public.school_learning_items%rowtype;
  selected_student public.students%rowtype;
  saved_submission public.school_task_submissions%rowtype;
  answer_text text := btrim(p_answer);
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'siswa'
  then
    raise exception 'Pengumpulan tugas hanya tersedia bagi siswa aktif.'
      using errcode = '42501';
  end if;
  if answer_text is null
    or char_length(answer_text) not between 1 and 10000
    or translate(answer_text, E'\n\r\t', '') ~ '[[:cntrl:]]'
  then
    raise exception 'Jawaban wajib diisi dan maksimal 10000 karakter.'
      using errcode = '22023';
  end if;

  select item.*
    into selected_task
  from public.school_learning_items as item
  join public.tenants as tenant
    on tenant.id = item.tenant_id and tenant.active = true
  where item.id = p_task_id
    and item.tenant_id = (select public.current_tenant_id())
    and item.kind = 'task'
    and item.published = true
    and item.due_at >= now()
  for update of item;

  if selected_task.id is null then
    raise exception 'Tugas tidak tersedia, sudah ditutup, atau bukan untuk sekolah aktif.'
      using errcode = '22023';
  end if;

  select student.*
    into selected_student
  from public.student_account_links as link
  join public.students as student
    on student.id = link.student_id
    and student.tenant_id = link.tenant_id
  where link.user_id = auth.uid()
    and link.tenant_id = selected_task.tenant_id
    and student.kelas = selected_task.class_name
  for update of student;

  if selected_student.id is null then
    raise exception 'Akun siswa belum ditautkan ke siswa pada kelas tugas ini.'
      using errcode = '42501';
  end if;

  insert into public.school_task_submissions as existing (
    task_id, student_id, tenant_id, answer
  )
  values (
    selected_task.id, selected_student.id, selected_task.tenant_id, answer_text
  )
  on conflict (task_id, student_id)
  do update set
    answer = excluded.answer,
    submitted_at = now(),
    feedback = null,
    reviewed_by = null,
    reviewed_at = null
  where existing.tenant_id = selected_task.tenant_id
  returning existing.* into saved_submission;

  if saved_submission.id is null then
    raise exception 'Tugas tidak dapat disimpan.'
      using errcode = '42501';
  end if;

  return query select saved_submission.id, saved_submission.submitted_at;
end;
$$;

create or replace function public.student_school_task_submissions()
returns table (
  task_id uuid,
  answer text,
  submitted_at timestamptz,
  feedback text,
  reviewed_at timestamptz
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
    raise exception 'Riwayat pengumpulan hanya tersedia bagi siswa aktif.'
      using errcode = '42501';
  end if;

  return query
  select submission.task_id, submission.answer, submission.submitted_at,
    submission.feedback, submission.reviewed_at
  from public.school_task_submissions as submission
  join public.tenants as tenant
    on tenant.id = submission.tenant_id and tenant.active = true
  join public.school_learning_items as item
    on item.id = submission.task_id
    and item.tenant_id = submission.tenant_id
    and item.kind = 'task'
  join public.student_account_links as link
    on link.student_id = submission.student_id
    and link.tenant_id = submission.tenant_id
    and link.user_id = auth.uid()
  where submission.tenant_id = (select public.current_tenant_id())
  order by submission.submitted_at desc, submission.task_id
  limit 500;
end;
$$;

create or replace function public.school_task_submissions(p_task_id uuid)
returns table (
  submission_id uuid,
  student_name text,
  class_name text,
  answer text,
  submitted_at timestamptz,
  feedback text,
  reviewed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_task public.school_learning_items%rowtype;
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) not in (
      'admin_sekolah', 'operator', 'guru', 'guru_bk',
      'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
  then
    raise exception 'Tinjauan tugas hanya tersedia bagi staf sekolah aktif.'
      using errcode = '42501';
  end if;

  select item.*
    into selected_task
  from public.school_learning_items as item
  join public.tenants as tenant
    on tenant.id = item.tenant_id and tenant.active = true
  where item.id = p_task_id
    and item.tenant_id = (select public.current_tenant_id())
    and item.kind = 'task'
    and (
      item.author_id = auth.uid()
      or (select public.current_app_role()) in ('admin_sekolah', 'operator')
    );

  if selected_task.id is null then
    raise exception 'Tugas tidak ditemukan atau akses ditolak.'
      using errcode = '42501';
  end if;

  return query
  select submission.id, student.nama, student.kelas, submission.answer,
    submission.submitted_at, submission.feedback, submission.reviewed_at
  from public.school_task_submissions as submission
  join public.students as student
    on student.id = submission.student_id
    and student.tenant_id = submission.tenant_id
  where submission.task_id = selected_task.id
    and submission.tenant_id = selected_task.tenant_id
  order by submission.submitted_at, student.nama
  limit 500;
end;
$$;

create or replace function public.review_school_task_submission(
  p_submission_id uuid,
  p_feedback text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_submission public.school_task_submissions%rowtype;
  feedback_text text := nullif(btrim(p_feedback), '');
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) not in (
      'admin_sekolah', 'operator', 'guru', 'guru_bk',
      'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
  then
    raise exception 'Umpan balik hanya tersedia bagi staf sekolah aktif.'
      using errcode = '42501';
  end if;
  if p_feedback is not null
    and char_length(btrim(p_feedback)) > 5000
  then
    raise exception 'Umpan balik maksimal 5000 karakter.'
      using errcode = '22023';
  end if;

  select submission.*
    into selected_submission
  from public.school_task_submissions as submission
  join public.school_learning_items as item
    on item.id = submission.task_id
    and item.tenant_id = submission.tenant_id
  join public.tenants as tenant
    on tenant.id = submission.tenant_id and tenant.active = true
  where submission.id = p_submission_id
    and submission.tenant_id = (select public.current_tenant_id())
    and item.kind = 'task'
    and (
      item.author_id = auth.uid()
      or (select public.current_app_role()) in ('admin_sekolah', 'operator')
    )
  for update of submission;

  if selected_submission.id is null then
    raise exception 'Pengumpulan tidak ditemukan atau akses ditolak.'
      using errcode = '42501';
  end if;

  update public.school_task_submissions as submission
  set feedback = feedback_text,
      reviewed_by = case when feedback_text is null then null else auth.uid() end,
      reviewed_at = case when feedback_text is null then null else now() end
  where submission.id = selected_submission.id;
end;
$$;

revoke all on function public.submit_school_task(uuid, text) from public, anon;
revoke all on function public.student_school_task_submissions() from public, anon;
revoke all on function public.school_task_submissions(uuid) from public, anon;
revoke all on function public.review_school_task_submission(uuid, text) from public, anon;
grant execute on function public.submit_school_task(uuid, text) to authenticated;
grant execute on function public.student_school_task_submissions() to authenticated;
grant execute on function public.school_task_submissions(uuid) to authenticated;
grant execute on function public.review_school_task_submission(uuid, text) to authenticated;
