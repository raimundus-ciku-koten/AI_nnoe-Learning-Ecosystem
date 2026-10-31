create table if not exists public.student_class_schedule (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete cascade,
  kelas text not null check (char_length(btrim(kelas)) between 1 and 30 and kelas = btrim(kelas)),
  day_of_week smallint not null check (day_of_week between 1 and 7),
  starts_at time not null,
  ends_at time not null,
  mapel text not null check (char_length(btrim(mapel)) between 1 and 80 and mapel = btrim(mapel)),
  ruang text not null default '' check (char_length(ruang) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.student_learning_materials (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete cascade,
  kelas text not null check (char_length(btrim(kelas)) between 1 and 30 and kelas = btrim(kelas)),
  mapel text not null check (char_length(btrim(mapel)) between 1 and 80 and mapel = btrim(mapel)),
  title text not null check (char_length(btrim(title)) between 1 and 160 and title = btrim(title)),
  description text not null default '' check (char_length(description) <= 2000),
  resource_url text not null check (
    char_length(resource_url) between 9 and 2048
    and resource_url ~ '^https://[^[:space:]]+$'
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists student_class_schedule_tenant_class_day_idx
  on public.student_class_schedule (tenant_id, kelas, day_of_week, starts_at);
create index if not exists student_class_schedule_owner_idx
  on public.student_class_schedule (owner_id, tenant_id);
create index if not exists student_learning_materials_tenant_class_updated_idx
  on public.student_learning_materials (tenant_id, kelas, updated_at desc);
create index if not exists student_learning_materials_owner_idx
  on public.student_learning_materials (owner_id, tenant_id);

drop trigger if exists student_class_schedule_set_updated_at
  on public.student_class_schedule;
create trigger student_class_schedule_set_updated_at
  before update on public.student_class_schedule
  for each row execute function public.set_updated_at();

drop trigger if exists student_learning_materials_set_updated_at
  on public.student_learning_materials;
create trigger student_learning_materials_set_updated_at
  before update on public.student_learning_materials
  for each row execute function public.set_updated_at();

alter table public.student_class_schedule enable row level security;
alter table public.student_learning_materials enable row level security;

revoke all on table public.student_class_schedule, public.student_learning_materials
  from public, anon, authenticated;
grant select, delete on table public.student_class_schedule,
  public.student_learning_materials to authenticated;
grant insert (tenant_id, owner_id, kelas, day_of_week, starts_at, ends_at, mapel, ruang)
  on public.student_class_schedule to authenticated;
grant update (kelas, day_of_week, starts_at, ends_at, mapel, ruang)
  on public.student_class_schedule to authenticated;
grant insert (tenant_id, owner_id, kelas, mapel, title, description, resource_url)
  on public.student_learning_materials to authenticated;
grant update (kelas, mapel, title, description, resource_url)
  on public.student_learning_materials to authenticated;
grant all on table public.student_class_schedule, public.student_learning_materials
  to service_role;

create or replace function public.can_manage_student_learning()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and (select public.current_user_is_active())
    and (select public.current_app_role()) in (
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = (select public.current_tenant_id())
        and tenant.active = true
    )
    and exists (
      select 1
      from public.tenant_entitlements as entitlement
      where entitlement.tenant_id = (select public.current_tenant_id())
        and entitlement.status in ('trial', 'active')
        and (entitlement.valid_until is null or entitlement.valid_until > now())
    )
$$;

revoke all on function public.can_manage_student_learning()
  from public, anon;
grant execute on function public.can_manage_student_learning() to authenticated;

create or replace function public.can_publish_student_learning(
  p_kelas text,
  p_mapel text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select public.can_manage_student_learning())
    and p_kelas is not null
    and p_mapel is not null
    and exists (
      select 1
      from public.profiles as profile
      where profile.id = (select auth.uid())
        and profile.tenant_id = (select public.current_tenant_id())
        and profile.active = true
        and p_kelas = any(profile.kelas_ids)
        and p_mapel = any(profile.mapel_ids)
    )
$$;

revoke all on function public.can_publish_student_learning(text, text)
  from public, anon;
grant execute on function public.can_publish_student_learning(text, text)
  to authenticated;

drop policy if exists "Entitled teachers manage their own student schedules"
  on public.student_class_schedule;
create policy "Entitled teachers manage their own student schedules"
  on public.student_class_schedule
  for all
  to authenticated
  using (
    (select public.can_publish_student_learning(kelas, mapel))
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
  )
  with check (
    (select public.can_publish_student_learning(kelas, mapel))
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
  );

drop policy if exists "Entitled teachers manage their own student materials"
  on public.student_learning_materials;
create policy "Entitled teachers manage their own student materials"
  on public.student_learning_materials
  for all
  to authenticated
  using (
    (select public.can_publish_student_learning(kelas, mapel))
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
  )
  with check (
    (select public.can_publish_student_learning(kelas, mapel))
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
  );

create or replace function public.student_learning_schedule()
returns table (
  id uuid,
  kelas text,
  day_of_week smallint,
  starts_at time,
  ends_at time,
  mapel text,
  ruang text
)
language plpgsql
stable
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
  select schedule.id, schedule.kelas, schedule.day_of_week,
    schedule.starts_at, schedule.ends_at, schedule.mapel, schedule.ruang
  from public.student_account_links as link
  join public.students as student
    on student.id = link.student_id and student.tenant_id = link.tenant_id
  join public.student_class_schedule as schedule
    on schedule.tenant_id = student.tenant_id and schedule.kelas = student.kelas
  join public.profiles as teacher
    on teacher.id = schedule.owner_id
    and teacher.tenant_id = schedule.tenant_id
    and teacher.active = true
    and teacher.roles && array['guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler']::text[]
    and schedule.kelas = any(teacher.kelas_ids)
    and schedule.mapel = any(teacher.mapel_ids)
  join public.tenants as tenant
    on tenant.id = schedule.tenant_id and tenant.active = true
  where link.user_id = auth.uid()
  order by schedule.day_of_week, schedule.starts_at, schedule.id;
end;
$$;

create or replace function public.student_learning_materials()
returns table (
  id uuid,
  kelas text,
  mapel text,
  title text,
  description text,
  resource_url text,
  updated_at timestamptz
)
language plpgsql
stable
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
  select material.id, material.kelas, material.mapel, material.title,
    material.description, material.resource_url, material.updated_at
  from public.student_account_links as link
  join public.students as student
    on student.id = link.student_id and student.tenant_id = link.tenant_id
  join public.student_learning_materials as material
    on material.tenant_id = student.tenant_id and material.kelas = student.kelas
  join public.profiles as teacher
    on teacher.id = material.owner_id
    and teacher.tenant_id = material.tenant_id
    and teacher.active = true
    and teacher.roles && array['guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler']::text[]
    and material.kelas = any(teacher.kelas_ids)
    and material.mapel = any(teacher.mapel_ids)
  join public.tenants as tenant
    on tenant.id = material.tenant_id and tenant.active = true
  where link.user_id = auth.uid()
  order by material.updated_at desc, material.id;
end;
$$;

revoke all on function public.student_learning_schedule()
  from public, anon;
revoke all on function public.student_learning_materials()
  from public, anon;
grant execute on function public.student_learning_schedule() to authenticated;
grant execute on function public.student_learning_materials() to authenticated;
