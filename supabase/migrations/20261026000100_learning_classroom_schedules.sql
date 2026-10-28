create table if not exists public.learning_classroom_schedules (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null,
  tenant_id text not null references public.tenants(id) on delete restrict,
  teacher_id uuid not null default auth.uid()
    references public.profiles(id) on delete restrict,
  weekday smallint not null check (weekday between 1 and 7),
  starts_at time not null,
  ends_at time not null check (ends_at > starts_at),
  topic text not null check (
    char_length(topic) between 1 and 120
    and topic = btrim(topic)
    and topic !~ '[[:cntrl:]]'
  ),
  location text not null default '' check (
    char_length(location) <= 120
    and location = btrim(location)
    and location !~ '[[:cntrl:]]'
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (classroom_id, teacher_id, weekday, starts_at),
  foreign key (classroom_id, tenant_id)
    references public.learning_classrooms(id, tenant_id) on delete cascade
);

create index if not exists learning_classroom_schedules_student_idx
  on public.learning_classroom_schedules
  (tenant_id, classroom_id, weekday, starts_at);

drop trigger if exists learning_classroom_schedules_set_updated_at
  on public.learning_classroom_schedules;
create trigger learning_classroom_schedules_set_updated_at
  before update on public.learning_classroom_schedules
  for each row execute function public.set_updated_at();

alter table public.learning_classroom_schedules enable row level security;
revoke all on table public.learning_classroom_schedules
  from public, anon, authenticated;
grant select, insert, update, delete on table public.learning_classroom_schedules
  to authenticated;
grant all on table public.learning_classroom_schedules to service_role;

drop policy if exists "Active classroom members read published schedules"
  on public.learning_classroom_schedules;
create policy "Active classroom members read published schedules"
  on public.learning_classroom_schedules
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = learning_classroom_schedules.tenant_id
        and tenant.active = true
    )
    and (
      (select public.current_app_role()) = 'superadmin'
      or (
        tenant_id = (select public.current_tenant_id())
        and (
          (select public.current_app_role()) in ('admin', 'admin_sekolah', 'operator')
          or exists (
            select 1
            from public.classroom_members as member
            where member.tenant_id = learning_classroom_schedules.tenant_id
              and member.classroom_id = learning_classroom_schedules.classroom_id
              and member.user_id = (select auth.uid())
          )
        )
      )
    )
  );

drop policy if exists "Assigned teachers publish classroom schedules"
  on public.learning_classroom_schedules;
create policy "Assigned teachers publish classroom schedules"
  on public.learning_classroom_schedules
  for insert
  to authenticated
  with check (
    (select public.current_user_is_active())
    and tenant_id = (select public.current_tenant_id())
    and teacher_id = (select auth.uid())
    and (select public.current_app_role()) in (
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
    and exists (
      select 1
      from public.tenants as tenant
      join public.classroom_members as member
        on member.tenant_id = tenant.id
       and member.classroom_id = learning_classroom_schedules.classroom_id
       and member.user_id = (select auth.uid())
       and member.member_role = 'guru'
      where tenant.id = learning_classroom_schedules.tenant_id
        and tenant.active = true
    )
  );

drop policy if exists "Assigned teachers update their published schedules"
  on public.learning_classroom_schedules;
create policy "Assigned teachers update their published schedules"
  on public.learning_classroom_schedules
  for update
  to authenticated
  using (
    (select public.current_user_is_active())
    and tenant_id = (select public.current_tenant_id())
    and teacher_id = (select auth.uid())
    and (select public.current_app_role()) in (
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
    and exists (
      select 1
      from public.tenants as tenant
      join public.classroom_members as member
        on member.tenant_id = tenant.id
       and member.classroom_id = learning_classroom_schedules.classroom_id
       and member.user_id = (select auth.uid())
       and member.member_role = 'guru'
      where tenant.id = learning_classroom_schedules.tenant_id
        and tenant.active = true
    )
  )
  with check (
    (select public.current_user_is_active())
    and tenant_id = (select public.current_tenant_id())
    and teacher_id = (select auth.uid())
    and (select public.current_app_role()) in (
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
    and exists (
      select 1
      from public.tenants as tenant
      join public.classroom_members as member
        on member.tenant_id = tenant.id
       and member.classroom_id = learning_classroom_schedules.classroom_id
       and member.user_id = (select auth.uid())
       and member.member_role = 'guru'
      where tenant.id = learning_classroom_schedules.tenant_id
        and tenant.active = true
    )
  );

drop policy if exists "Assigned teachers delete their published schedules"
  on public.learning_classroom_schedules;
create policy "Assigned teachers delete their published schedules"
  on public.learning_classroom_schedules
  for delete
  to authenticated
  using (
    (select public.current_user_is_active())
    and tenant_id = (select public.current_tenant_id())
    and teacher_id = (select auth.uid())
    and (select public.current_app_role()) in (
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
    and exists (
      select 1
      from public.tenants as tenant
      join public.classroom_members as member
        on member.tenant_id = tenant.id
       and member.classroom_id = learning_classroom_schedules.classroom_id
       and member.user_id = (select auth.uid())
       and member.member_role = 'guru'
      where tenant.id = learning_classroom_schedules.tenant_id
        and tenant.active = true
    )
  );
