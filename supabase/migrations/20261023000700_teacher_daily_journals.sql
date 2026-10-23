create table if not exists public.school_teacher_journals (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete restrict,
  author_id uuid not null references auth.users(id) on delete restrict,
  class_name text not null check (
    char_length(class_name) between 1 and 30
    and class_name = btrim(class_name)
    and class_name !~ '[[:cntrl:]]'
  ),
  subject text not null check (
    char_length(subject) between 1 and 100
    and subject = btrim(subject)
    and subject !~ '[[:cntrl:]]'
  ),
  lesson_date date not null default current_date,
  topic text not null check (
    char_length(topic) between 1 and 200
    and topic = btrim(topic)
    and topic !~ '[[:cntrl:]]'
  ),
  learning_objective text not null check (
    char_length(learning_objective) between 1 and 2000
    and learning_objective = btrim(learning_objective)
  ),
  activities text not null check (
    char_length(activities) between 1 and 6000
    and activities = btrim(activities)
  ),
  reflection text not null default '' check (
    char_length(reflection) <= 4000
    and reflection = btrim(reflection)
  ),
  follow_up text not null default '' check (
    char_length(follow_up) <= 4000
    and follow_up = btrim(follow_up)
  ),
  status text not null default 'draf' check (status in ('draf', 'selesai')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists school_teacher_journals_owner_date_idx
  on public.school_teacher_journals (tenant_id, author_id, lesson_date desc, updated_at desc);

drop trigger if exists school_teacher_journals_set_updated_at
  on public.school_teacher_journals;
create trigger school_teacher_journals_set_updated_at
  before update on public.school_teacher_journals
  for each row execute function public.set_updated_at();

alter table public.school_teacher_journals enable row level security;

revoke all on table public.school_teacher_journals from public, anon, authenticated;
grant select, delete on table public.school_teacher_journals to authenticated;
grant insert (
  tenant_id, author_id, class_name, subject, lesson_date, topic,
  learning_objective, activities, reflection, follow_up, status
) on public.school_teacher_journals to authenticated;
grant update (
  class_name, subject, lesson_date, topic, learning_objective,
  activities, reflection, follow_up, status
) on public.school_teacher_journals to authenticated;
grant all on table public.school_teacher_journals to service_role;

drop policy if exists "Active teachers read their own daily journals"
  on public.school_teacher_journals;
create policy "Active teachers read their own daily journals"
  on public.school_teacher_journals
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and author_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in (
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
    and exists (
      select 1 from public.tenants as tenant
      where tenant.id = school_teacher_journals.tenant_id
        and tenant.active = true
    )
  );

drop policy if exists "Active teachers create journals for their own roster"
  on public.school_teacher_journals;
create policy "Active teachers create journals for their own roster"
  on public.school_teacher_journals
  for insert
  to authenticated
  with check (
    (select public.current_user_is_active())
    and author_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in (
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
    and exists (
      select 1 from public.tenants as tenant
      where tenant.id = school_teacher_journals.tenant_id
        and tenant.active = true
    )
    and exists (
      select 1 from public.students as student
      where student.owner_id = (select auth.uid())
        and student.tenant_id = school_teacher_journals.tenant_id
        and student.kelas = school_teacher_journals.class_name
    )
  );

drop policy if exists "Active teachers update their own daily journals"
  on public.school_teacher_journals;
create policy "Active teachers update their own daily journals"
  on public.school_teacher_journals
  for update
  to authenticated
  using (
    (select public.current_user_is_active())
    and author_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in (
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
    and exists (
      select 1 from public.tenants as tenant
      where tenant.id = school_teacher_journals.tenant_id
        and tenant.active = true
    )
  )
  with check (
    (select public.current_user_is_active())
    and author_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in (
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
    and exists (
      select 1 from public.tenants as tenant
      where tenant.id = school_teacher_journals.tenant_id
        and tenant.active = true
    )
    and exists (
      select 1 from public.students as student
      where student.owner_id = (select auth.uid())
        and student.tenant_id = school_teacher_journals.tenant_id
        and student.kelas = school_teacher_journals.class_name
    )
  );

drop policy if exists "Active teachers delete their own daily journals"
  on public.school_teacher_journals;
create policy "Active teachers delete their own daily journals"
  on public.school_teacher_journals
  for delete
  to authenticated
  using (
    (select public.current_user_is_active())
    and author_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in (
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
    and exists (
      select 1 from public.tenants as tenant
      where tenant.id = school_teacher_journals.tenant_id
        and tenant.active = true
    )
  );
