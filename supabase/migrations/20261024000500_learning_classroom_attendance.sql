create table if not exists public.learning_classroom_attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null,
  tenant_id text not null references public.tenants(id) on delete restrict,
  attendance_date date not null,
  title text not null check (
    char_length(title) between 1 and 120
    and title = btrim(title)
    and title !~ '[[:cntrl:]]'
  ),
  created_by uuid not null default auth.uid()
    references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (classroom_id, attendance_date),
  foreign key (classroom_id, tenant_id)
    references public.learning_classrooms(id, tenant_id) on delete cascade
);

create table if not exists public.learning_classroom_attendance (
  session_id uuid not null
    references public.learning_classroom_attendance_sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete restrict,
  status text not null check (status in ('hadir', 'izin', 'sakit', 'alpa')),
  note text check (note is null or char_length(note) <= 500),
  marked_by uuid not null references public.profiles(id) on delete restrict,
  marked_at timestamptz not null default now(),
  primary key (session_id, student_id)
);

create index if not exists learning_classroom_attendance_sessions_class_date_idx
  on public.learning_classroom_attendance_sessions (tenant_id, classroom_id, attendance_date desc);

alter table public.learning_classroom_attendance_sessions enable row level security;
alter table public.learning_classroom_attendance enable row level security;

revoke all on table public.learning_classroom_attendance_sessions,
  public.learning_classroom_attendance from public, anon, authenticated;
grant select on table public.learning_classroom_attendance_sessions,
  public.learning_classroom_attendance to authenticated;
grant all on table public.learning_classroom_attendance_sessions,
  public.learning_classroom_attendance to service_role;

drop policy if exists "Active classroom members read attendance sessions"
  on public.learning_classroom_attendance_sessions;
create policy "Active classroom members read attendance sessions"
  on public.learning_classroom_attendance_sessions
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and exists (
      select 1 from public.tenants as tenant
      where tenant.id = learning_classroom_attendance_sessions.tenant_id
        and tenant.active = true
    )
    and (
      (select public.current_app_role()) = 'superadmin'
      or (
        tenant_id = (select public.current_tenant_id())
        and (
          (select public.current_app_role()) in ('admin_sekolah', 'operator')
          or exists (
            select 1 from public.classroom_members as member
            where member.classroom_id = learning_classroom_attendance_sessions.classroom_id
              and member.tenant_id = learning_classroom_attendance_sessions.tenant_id
              and member.user_id = (select auth.uid())
          )
        )
      )
    )
  );

drop policy if exists "Users read permitted classroom attendance"
  on public.learning_classroom_attendance;
create policy "Users read permitted classroom attendance"
  on public.learning_classroom_attendance
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and exists (
      select 1
      from public.learning_classroom_attendance_sessions as session
      join public.learning_classrooms as classroom
        on classroom.id = session.classroom_id
       and classroom.tenant_id = session.tenant_id
      join public.tenants as tenant
        on tenant.id = session.tenant_id and tenant.active = true
      where session.id = learning_classroom_attendance.session_id
        and (
          (select public.current_app_role()) = 'superadmin'
          or (
            session.tenant_id = (select public.current_tenant_id())
            and (
              student_id = (select auth.uid())
              or (select public.current_app_role()) in ('admin_sekolah', 'operator')
              or exists (
                select 1 from public.classroom_members as member
                where member.classroom_id = session.classroom_id
                  and member.tenant_id = session.tenant_id
                  and member.user_id = (select auth.uid())
                  and member.member_role = 'guru'
              )
            )
          )
        )
    )
  );

create or replace function public.create_learning_classroom_attendance_session(
  p_classroom_id uuid,
  p_attendance_date date,
  p_title text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  session_id uuid;
begin
  if actor_id is null
    or not public.current_user_is_active()
    or public.current_app_role() not in (
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
    ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if p_attendance_date is null
    or p_title is null
    or char_length(btrim(coalesce(p_title, ''))) not between 1 and 120
    or p_title ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'invalid-attendance-session';
  end if;
  if not exists (
    select 1
    from public.classroom_members as member
    join public.tenants as tenant on tenant.id = member.tenant_id and tenant.active = true
    where member.classroom_id = p_classroom_id
      and member.tenant_id = public.current_tenant_id()
      and member.user_id = actor_id
      and member.member_role = 'guru'
  ) then
    raise exception using errcode = '42501', message = 'classroom-forbidden';
  end if;

  insert into public.learning_classroom_attendance_sessions (
    classroom_id, tenant_id, attendance_date, title, created_by
  )
  values (
    p_classroom_id, public.current_tenant_id(), p_attendance_date, btrim(p_title), actor_id
  )
  on conflict (classroom_id, attendance_date) do nothing
  returning id into session_id;

  if session_id is null then
    select existing.id into session_id
    from public.learning_classroom_attendance_sessions as existing
    where existing.classroom_id = p_classroom_id
      and existing.attendance_date = p_attendance_date;
  end if;
  return session_id;
end;
$$;

create or replace function public.learning_classroom_attendance_roster(p_classroom_id uuid)
returns table (student_id uuid, student_name text)
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
  select profile.id, profile.nama
  from public.classroom_members as member
  join public.profiles as profile
    on profile.id = member.user_id
   and profile.tenant_id = member.tenant_id
   and profile.active = true
   and profile.role = 'siswa'
  where member.classroom_id = p_classroom_id
    and member.tenant_id = public.current_tenant_id()
    and member.member_role = 'siswa'
  order by profile.nama;
end;
$$;

create or replace function public.record_learning_classroom_attendance(
  p_session_id uuid,
  p_records jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  session_row public.learning_classroom_attendance_sessions%rowtype;
  record_row jsonb;
  student_id_value uuid;
  status_value text;
  note_value text;
  expected_count integer;
  record_count integer := 0;
  processed_students uuid[] := '{}'::uuid[];
begin
  if actor_id is null
    or not public.current_user_is_active()
    or public.current_app_role() not in (
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
    ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if p_records is null or jsonb_typeof(p_records) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'invalid-attendance-records';
  end if;
  if jsonb_array_length(p_records) > 1000 then
    raise exception using errcode = '22023', message = 'invalid-attendance-records';
  end if;

  select session.* into session_row
  from public.learning_classroom_attendance_sessions as session
  join public.tenants as tenant
    on tenant.id = session.tenant_id and tenant.active = true
  join public.classroom_members as teacher
    on teacher.classroom_id = session.classroom_id
   and teacher.tenant_id = session.tenant_id
   and teacher.user_id = actor_id
   and teacher.member_role = 'guru'
  where session.id = p_session_id
    and session.tenant_id = public.current_tenant_id();
  if session_row.id is null then
    raise exception using errcode = '42501', message = 'session-forbidden';
  end if;

  select count(*)::integer into expected_count
  from public.classroom_members as member
  join public.profiles as profile
    on profile.id = member.user_id
   and profile.tenant_id = member.tenant_id
   and profile.active = true
   and profile.role = 'siswa'
  where member.classroom_id = session_row.classroom_id
    and member.tenant_id = session_row.tenant_id
    and member.member_role = 'siswa';
  if jsonb_array_length(p_records) <> expected_count then
    raise exception using errcode = '22023', message = 'attendance-roster-incomplete';
  end if;

  for record_row in select value from jsonb_array_elements(p_records)
  loop
    if jsonb_typeof(record_row) is distinct from 'object'
      or coalesce(record_row ->> 'studentId', '') !~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      raise exception using errcode = '22023', message = 'invalid-attendance-student';
    end if;
    student_id_value := (record_row ->> 'studentId')::uuid;
    if student_id_value = any(processed_students) then
      raise exception using errcode = '22023', message = 'duplicate-attendance-student';
    end if;
    processed_students := array_append(processed_students, student_id_value);
    status_value := record_row ->> 'status';
    note_value := nullif(btrim(coalesce(record_row ->> 'note', '')), '');
    if status_value is null or status_value not in ('hadir', 'izin', 'sakit', 'alpa')
      or (note_value is not null and char_length(note_value) > 500)
      or not exists (
        select 1
        from public.classroom_members as member
        join public.profiles as profile
          on profile.id = member.user_id
         and profile.tenant_id = member.tenant_id
         and profile.active = true
         and profile.role = 'siswa'
        where member.classroom_id = session_row.classroom_id
          and member.tenant_id = session_row.tenant_id
          and member.user_id = student_id_value
          and member.member_role = 'siswa'
      ) then
      raise exception using errcode = '22023', message = 'invalid-attendance-record';
    end if;

    insert into public.learning_classroom_attendance (
      session_id, student_id, status, note, marked_by, marked_at
    )
    values (
      session_row.id, student_id_value, status_value, note_value, actor_id, now()
    )
    on conflict (session_id, student_id)
    do update set
      status = excluded.status,
      note = excluded.note,
      marked_by = excluded.marked_by,
      marked_at = excluded.marked_at;
    record_count := record_count + 1;
  end loop;
  return record_count;
end;
$$;

revoke all on function public.create_learning_classroom_attendance_session(uuid, date, text)
  from public, anon, authenticated;
revoke all on function public.learning_classroom_attendance_roster(uuid)
  from public, anon, authenticated;
revoke all on function public.record_learning_classroom_attendance(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_learning_classroom_attendance_session(uuid, date, text)
  to authenticated;
grant execute on function public.learning_classroom_attendance_roster(uuid)
  to authenticated;
grant execute on function public.record_learning_classroom_attendance(uuid, jsonb)
  to authenticated;
