create table if not exists public.learning_classrooms (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete restrict,
  name text not null check (
    char_length(name) between 2 and 120
    and name = btrim(name)
    and name !~ '[[:cntrl:]]'
  ),
  subject text check (
    subject is null or (
      char_length(subject) between 1 and 120
      and subject = btrim(subject)
      and subject !~ '[[:cntrl:]]'
    )
  ),
  grade text check (
    grade is null or (
      char_length(grade) between 1 and 30
      and grade = btrim(grade)
      and grade !~ '[[:cntrl:]]'
    )
  ),
  academic_year text not null check (
    char_length(academic_year) between 4 and 20
    and academic_year = btrim(academic_year)
    and academic_year !~ '[[:cntrl:]]'
  ),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id)
);

create table if not exists public.classroom_members (
  classroom_id uuid not null,
  tenant_id text not null references public.tenants(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null check (member_role in ('guru', 'siswa')),
  added_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (classroom_id, user_id),
  foreign key (classroom_id, tenant_id)
    references public.learning_classrooms(id, tenant_id) on delete cascade
);

create index if not exists learning_classrooms_tenant_created_idx
  on public.learning_classrooms (tenant_id, created_at desc);
create index if not exists classroom_members_user_idx
  on public.classroom_members (tenant_id, user_id, classroom_id);

drop trigger if exists learning_classrooms_set_updated_at
  on public.learning_classrooms;
create trigger learning_classrooms_set_updated_at
  before update on public.learning_classrooms
  for each row execute function public.set_updated_at();

alter table public.learning_classrooms enable row level security;
alter table public.classroom_members enable row level security;

revoke all on table public.learning_classrooms, public.classroom_members
  from public, anon, authenticated;
grant select on table public.learning_classrooms, public.classroom_members
  to authenticated;
grant all on table public.learning_classrooms, public.classroom_members
  to service_role;

drop policy if exists "Active users read assigned learning classrooms"
  on public.learning_classrooms;
create policy "Active users read assigned learning classrooms"
  on public.learning_classrooms
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = learning_classrooms.tenant_id
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
            where member.classroom_id = learning_classrooms.id
              and member.tenant_id = learning_classrooms.tenant_id
              and member.user_id = (select auth.uid())
          )
        )
      )
    )
  );

drop policy if exists "Active users read their learning classroom memberships"
  on public.classroom_members;
create policy "Active users read their learning classroom memberships"
  on public.classroom_members
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and (
      (select public.current_app_role()) = 'superadmin'
      or (
        tenant_id = (select public.current_tenant_id())
        and (
          user_id = (select auth.uid())
          or (select public.current_app_role()) in ('admin_sekolah', 'operator')
        )
      )
    )
  );

create or replace function public.create_learning_classroom(
  p_tenant_id text,
  p_name text,
  p_subject text,
  p_grade text,
  p_academic_year text,
  p_teacher_ids uuid[],
  p_student_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := public.current_app_role();
  classroom_id uuid;
  normalized_name text := btrim(coalesce(p_name, ''));
  normalized_subject text := nullif(btrim(coalesce(p_subject, '')), '');
  normalized_grade text := nullif(btrim(coalesce(p_grade, '')), '');
  normalized_year text := btrim(coalesce(p_academic_year, ''));
  teacher_count integer;
  student_count integer;
begin
  if actor_id is null
    or not public.current_user_is_active()
    or actor_role not in ('admin_sekolah', 'operator', 'superadmin') then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  if p_tenant_id is null
    or (actor_role <> 'superadmin' and p_tenant_id <> public.current_tenant_id()) then
    raise exception using errcode = '42501', message = 'tenant-forbidden';
  end if;

  if not exists (
    select 1 from public.tenants
    where id = p_tenant_id and active = true
  ) then
    raise exception using errcode = 'P0002', message = 'active-tenant-not-found';
  end if;

  if char_length(normalized_name) not between 2 and 120
    or normalized_name ~ '[[:cntrl:]]'
    or (normalized_subject is not null and (
      char_length(normalized_subject) > 120 or normalized_subject ~ '[[:cntrl:]]'
    ))
    or (normalized_grade is not null and (
      char_length(normalized_grade) > 30 or normalized_grade ~ '[[:cntrl:]]'
    ))
    or char_length(normalized_year) not between 4 and 20
    or normalized_year ~ '[[:cntrl:]]'
    or p_teacher_ids is null
    or p_student_ids is null
    or cardinality(p_teacher_ids) not between 1 and 30
    or cardinality(p_student_ids) not between 1 and 1000
    or array_position(p_teacher_ids, null) is not null
    or array_position(p_student_ids, null) is not null then
    raise exception using errcode = '22023', message = 'invalid-classroom';
  end if;

  select count(distinct selected.user_id)::integer
  into teacher_count
  from unnest(p_teacher_ids) as selected(user_id);
  select count(distinct selected.user_id)::integer
  into student_count
  from unnest(p_student_ids) as selected(user_id);

  if teacher_count <> cardinality(p_teacher_ids)
    or student_count <> cardinality(p_student_ids)
    or exists (
      select 1
      from unnest(p_teacher_ids) as teacher(user_id)
      join unnest(p_student_ids) as student(user_id)
        on student.user_id = teacher.user_id
    )
    or (
      select count(*) from public.profiles as profile
      where profile.id = any(p_teacher_ids)
        and profile.tenant_id = p_tenant_id
        and profile.active = true
        and profile.role in (
          'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
        )
    ) <> cardinality(p_teacher_ids)
    or (
      select count(*) from public.profiles as profile
      where profile.id = any(p_student_ids)
        and profile.tenant_id = p_tenant_id
        and profile.active = true
        and profile.role = 'siswa'
    ) <> cardinality(p_student_ids) then
    raise exception using errcode = '22023', message = 'invalid-classroom-members';
  end if;

  insert into public.learning_classrooms (
    tenant_id, name, subject, grade, academic_year, created_by
  )
  values (
    p_tenant_id, normalized_name, normalized_subject, normalized_grade,
    normalized_year, actor_id
  )
  returning id into classroom_id;

  insert into public.classroom_members (
    classroom_id, tenant_id, user_id, member_role, added_by
  )
  select classroom_id, p_tenant_id, selected.user_id, 'guru', actor_id
  from unnest(p_teacher_ids) as selected(user_id);

  insert into public.classroom_members (
    classroom_id, tenant_id, user_id, member_role, added_by
  )
  select classroom_id, p_tenant_id, selected.user_id, 'siswa', actor_id
  from unnest(p_student_ids) as selected(user_id);

  return classroom_id;
end;
$$;

revoke all on function public.create_learning_classroom(
  text, text, text, text, text, uuid[], uuid[]
) from public, anon, authenticated;
grant execute on function public.create_learning_classroom(
  text, text, text, text, text, uuid[], uuid[]
) to authenticated;

create or replace function public.learning_classroom_candidates(p_tenant_id text)
returns table (id uuid, nama text, role text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text := public.current_app_role();
begin
  if auth.uid() is null
    or not public.current_user_is_active()
    or actor_role not in ('admin_sekolah', 'operator', 'superadmin') then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  if p_tenant_id is null
    or (actor_role <> 'superadmin' and p_tenant_id <> public.current_tenant_id()) then
    raise exception using errcode = '42501', message = 'tenant-forbidden';
  end if;

  if not exists (
    select 1 from public.tenants
    where tenants.id = p_tenant_id and tenants.active = true
  ) then
    raise exception using errcode = 'P0002', message = 'active-tenant-not-found';
  end if;

  return query
    select profile.id, profile.nama, profile.role
    from public.profiles as profile
    where profile.tenant_id = p_tenant_id
      and profile.active = true
      and profile.role in (
        'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler', 'siswa'
      )
    order by profile.nama;
end;
$$;

revoke all on function public.learning_classroom_candidates(text)
  from public, anon, authenticated;
grant execute on function public.learning_classroom_candidates(text)
  to authenticated;
