create table if not exists public.learning_classroom_journals (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null,
  tenant_id text not null references public.tenants(id) on delete restrict,
  author_id uuid not null default auth.uid()
    references public.profiles(id) on delete restrict,
  lesson_date date not null,
  topic text not null check (
    char_length(topic) between 1 and 200
    and topic = btrim(topic)
    and topic !~ '[[:cntrl:]]'
  ),
  objectives text not null check (
    char_length(objectives) between 1 and 3000
    and objectives = btrim(objectives)
  ),
  activities text not null check (
    char_length(activities) between 1 and 6000
    and activities = btrim(activities)
  ),
  reflection text not null default '' check (char_length(reflection) <= 4000),
  follow_up text not null default '' check (char_length(follow_up) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (classroom_id, tenant_id)
    references public.learning_classrooms(id, tenant_id) on delete cascade
);

create index if not exists learning_classroom_journals_class_date_idx
  on public.learning_classroom_journals
  (tenant_id, classroom_id, lesson_date desc, updated_at desc);
create index if not exists learning_classroom_journals_author_date_idx
  on public.learning_classroom_journals (author_id, tenant_id, lesson_date desc);

drop trigger if exists learning_classroom_journals_set_updated_at
  on public.learning_classroom_journals;
create trigger learning_classroom_journals_set_updated_at
  before update on public.learning_classroom_journals
  for each row execute function public.set_updated_at();

alter table public.learning_classroom_journals enable row level security;
revoke all on table public.learning_classroom_journals
  from public, anon, authenticated;
grant select, insert, update, delete on table public.learning_classroom_journals
  to authenticated;
grant all on table public.learning_classroom_journals to service_role;

drop policy if exists "Assigned teachers read classroom journals"
  on public.learning_classroom_journals;
create policy "Assigned teachers read classroom journals"
  on public.learning_classroom_journals
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and tenant_id = (select public.current_tenant_id())
    and author_id = (select auth.uid())
    and (select public.current_app_role()) in (
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
    and exists (
      select 1
      from public.tenants as tenant
      join public.classroom_members as member
        on member.tenant_id = tenant.id
       and member.classroom_id = learning_classroom_journals.classroom_id
       and member.user_id = (select auth.uid())
       and member.member_role = 'guru'
      where tenant.id = learning_classroom_journals.tenant_id
        and tenant.active = true
    )
  );

drop policy if exists "Assigned teachers create classroom journals"
  on public.learning_classroom_journals;
create policy "Assigned teachers create classroom journals"
  on public.learning_classroom_journals
  for insert
  to authenticated
  with check (
    (select public.current_user_is_active())
    and tenant_id = (select public.current_tenant_id())
    and author_id = (select auth.uid())
    and (select public.current_app_role()) in (
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
    and exists (
      select 1
      from public.tenants as tenant
      join public.classroom_members as member
        on member.tenant_id = tenant.id
       and member.classroom_id = learning_classroom_journals.classroom_id
       and member.user_id = (select auth.uid())
       and member.member_role = 'guru'
      where tenant.id = learning_classroom_journals.tenant_id
        and tenant.active = true
    )
  );

drop policy if exists "Assigned teachers update own classroom journals"
  on public.learning_classroom_journals;
create policy "Assigned teachers update own classroom journals"
  on public.learning_classroom_journals
  for update
  to authenticated
  using (
    (select public.current_user_is_active())
    and tenant_id = (select public.current_tenant_id())
    and author_id = (select auth.uid())
    and (select public.current_app_role()) in (
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
    and exists (
      select 1
      from public.tenants as tenant
      join public.classroom_members as member
        on member.tenant_id = tenant.id
       and member.classroom_id = learning_classroom_journals.classroom_id
       and member.user_id = (select auth.uid())
       and member.member_role = 'guru'
      where tenant.id = learning_classroom_journals.tenant_id
        and tenant.active = true
    )
  )
  with check (
    (select public.current_user_is_active())
    and tenant_id = (select public.current_tenant_id())
    and author_id = (select auth.uid())
    and (select public.current_app_role()) in (
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
    and exists (
      select 1
      from public.tenants as tenant
      join public.classroom_members as member
        on member.tenant_id = tenant.id
       and member.classroom_id = learning_classroom_journals.classroom_id
       and member.user_id = (select auth.uid())
       and member.member_role = 'guru'
      where tenant.id = learning_classroom_journals.tenant_id
        and tenant.active = true
    )
  );

drop policy if exists "Assigned teachers delete own classroom journals"
  on public.learning_classroom_journals;
create policy "Assigned teachers delete own classroom journals"
  on public.learning_classroom_journals
  for delete
  to authenticated
  using (
    (select public.current_user_is_active())
    and tenant_id = (select public.current_tenant_id())
    and author_id = (select auth.uid())
    and (select public.current_app_role()) in (
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
    and exists (
      select 1
      from public.tenants as tenant
      join public.classroom_members as member
        on member.tenant_id = tenant.id
       and member.classroom_id = learning_classroom_journals.classroom_id
       and member.user_id = (select auth.uid())
       and member.member_role = 'guru'
      where tenant.id = learning_classroom_journals.tenant_id
        and tenant.active = true
    )
  );
