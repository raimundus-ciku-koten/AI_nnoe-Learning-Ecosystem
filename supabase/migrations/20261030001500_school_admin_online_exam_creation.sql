create or replace function public.create_school_online_exams(
  p_title text,
  p_kelas text[],
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_duration_minutes integer,
  p_question_ids uuid[]
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_class text;
  new_exam_id uuid;
  created_exam_ids uuid[] := array[]::uuid[];
  question_count integer;
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
    or p_question_ids is null or cardinality(p_question_ids) not between 1 and 500
    or array_position(p_question_ids, null) is not null
  then
    raise exception 'Pengaturan ujian sekolah tidak valid.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(p_kelas) as selected(kelas)
    where char_length(btrim(selected.kelas)) not between 1 and 30
      or btrim(selected.kelas) <> selected.kelas
  ) or (
    select count(distinct selected.kelas)
    from unnest(p_kelas) as selected(kelas)
  ) <> cardinality(p_kelas) then
    raise exception 'Daftar kelas tidak valid atau berisi duplikasi.'
      using errcode = '22023';
  end if;

  if (
    select count(distinct selected.question_id)
    from unnest(p_question_ids) as selected(question_id)
  ) <> cardinality(p_question_ids) then
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
      and question.jenis = 'pilihan_ganda'
      and question.kelas = any (p_kelas)
  ) <> cardinality(p_question_ids) then
    raise exception 'Semua soal harus pilihan ganda dan berasal dari tenant serta kelas terpilih.'
      using errcode = '42501';
  end if;

  foreach selected_class in array p_kelas loop
    select count(*)::integer
      into question_count
    from public.question_bank as question
    where question.id = any (p_question_ids)
      and question.tenant_id = (select public.current_tenant_id())
      and question.kelas = selected_class
      and question.jenis = 'pilihan_ganda';

    if question_count not between 1 and 100 then
      raise exception 'Setiap kelas harus memiliki 1 sampai 100 soal pilihan ganda.'
        using errcode = '22023';
    end if;

    insert into public.online_exams (
      tenant_id, owner_id, kelas, title, starts_at, ends_at, duration_minutes
    )
    values (
      (select public.current_tenant_id()),
      auth.uid(),
      selected_class,
      left(btrim(p_title) || ' - ' || selected_class, 160),
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
      row_number() over (order by selected.ordinality)::integer,
      question.jenis,
      question.pertanyaan,
      question.pilihan,
      question.jawaban
    from unnest(p_question_ids) with ordinality as selected(question_id, ordinality)
    join public.question_bank as question
      on question.id = selected.question_id
      and question.tenant_id = (select public.current_tenant_id())
      and question.kelas = selected_class
      and question.jenis = 'pilihan_ganda';

    created_exam_ids := array_append(created_exam_ids, new_exam_id);
  end loop;

  return created_exam_ids;
end;
$$;

revoke all on function public.create_school_online_exams(text, text[], timestamptz, timestamptz, integer, uuid[])
  from public, anon;
grant execute on function public.create_school_online_exams(text, text[], timestamptz, timestamptz, integer, uuid[])
  to authenticated;