create table if not exists public.learning_classroom_report_cards (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete restrict,
  classroom_id uuid not null,
  student_id uuid not null references public.profiles(id) on delete restrict,
  academic_year text not null check (academic_year ~ '^[0-9]{4}/[0-9]{4}$'),
  semester text not null check (semester in ('ganjil', 'genap')),
  student_name_snapshot text not null check (
    char_length(student_name_snapshot) between 1 and 120
    and student_name_snapshot = btrim(student_name_snapshot)
  ),
  score numeric(5, 2) not null check (score between 0 and 100),
  achievement_summary text not null default '' check (
    char_length(achievement_summary) <= 3000
  ),
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  published_by uuid references public.profiles(id) on delete restrict,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (classroom_id, student_id, academic_year, semester),
  foreign key (classroom_id, tenant_id)
    references public.learning_classrooms(id, tenant_id) on delete cascade,
  check ((status = 'published') = (published_by is not null)),
  check ((status = 'published') = (published_at is not null))
);

create table if not exists public.learning_classroom_report_card_audit (
  id bigint generated always as identity primary key,
  report_card_id uuid not null references public.learning_classroom_report_cards(id) on delete restrict,
  tenant_id text not null references public.tenants(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('draft_saved', 'published', 'reopened')),
  previous_score numeric(5, 2),
  next_score numeric(5, 2),
  reason text,
  occurred_at timestamptz not null default now()
);

create index if not exists learning_classroom_report_cards_tenant_period_idx
  on public.learning_classroom_report_cards (tenant_id, academic_year, semester, status);
create index if not exists learning_classroom_report_cards_student_period_idx
  on public.learning_classroom_report_cards (student_id, academic_year desc, semester);
create index if not exists learning_classroom_report_card_audit_tenant_time_idx
  on public.learning_classroom_report_card_audit (tenant_id, occurred_at desc);

drop trigger if exists learning_classroom_report_cards_set_updated_at
  on public.learning_classroom_report_cards;
create trigger learning_classroom_report_cards_set_updated_at
  before update on public.learning_classroom_report_cards
  for each row execute function public.set_updated_at();

alter table public.learning_classroom_report_cards enable row level security;
alter table public.learning_classroom_report_card_audit enable row level security;

revoke all on table public.learning_classroom_report_cards,
  public.learning_classroom_report_card_audit from public, anon, authenticated;
grant select on table public.learning_classroom_report_cards to authenticated;
grant all on table public.learning_classroom_report_cards,
  public.learning_classroom_report_card_audit to service_role;

drop policy if exists "School report cards visible by active classroom scope"
  on public.learning_classroom_report_cards;
create policy "School report cards visible by active classroom scope"
  on public.learning_classroom_report_cards
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = learning_classroom_report_cards.tenant_id
        and tenant.active = true
    )
    and tenant_id = (select public.current_tenant_id())
    and (
      (select public.current_app_role()) = 'admin_sekolah'
      or (
        (select public.current_app_role()) in (
          'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
        )
        and exists (
          select 1
          from public.classroom_members as member
          where member.classroom_id = learning_classroom_report_cards.classroom_id
            and member.tenant_id = learning_classroom_report_cards.tenant_id
            and member.user_id = (select auth.uid())
            and member.member_role = 'guru'
        )
      )
      or (
        (select public.current_app_role()) = 'siswa'
        and student_id = (select auth.uid())
        and status = 'published'
        and exists (
          select 1
          from public.classroom_members as member
          where member.classroom_id = learning_classroom_report_cards.classroom_id
            and member.tenant_id = learning_classroom_report_cards.tenant_id
            and member.user_id = (select auth.uid())
            and member.member_role = 'siswa'
        )
      )
    )
  );

create or replace function public.save_learning_classroom_report_card_draft(
  p_classroom_id uuid,
  p_student_id uuid,
  p_score numeric,
  p_achievement_summary text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := public.current_app_role();
  school_year text;
  active_semester text;
  school_level text;
  learner_name text;
  report_id uuid;
  previous_score numeric(5, 2);
begin
  if actor_id is null
    or not public.current_user_is_active()
    or actor_role not in ('guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler') then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if p_classroom_id is null or p_student_id is null
    or p_score is null or p_score < 0 or p_score > 100
    or p_achievement_summary is null
    or char_length(p_achievement_summary) > 3000
    or translate(p_achievement_summary, chr(9) || chr(10) || chr(13), '') ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'invalid-report-card';
  end if;

  select tenant.academic_year, tenant.semester, lower(btrim(coalesce(tenant.education_level, '')))
    into school_year, active_semester, school_level
  from public.tenants as tenant
  where tenant.id = public.current_tenant_id()
    and tenant.active = true;
  if school_year is null or active_semester is null
    or active_semester not in ('ganjil', 'genap') then
    raise exception using errcode = '55000', message = 'academic-period-not-configured';
  end if;
  if school_level in ('tk', 'paud', 'taman kanak-kanak') then
    raise exception using errcode = '55000', message = 'numeric-report-not-available-for-tk';
  end if;

  if not exists (
    select 1
    from public.classroom_members as teacher
    join public.learning_classrooms as classroom
      on classroom.id = teacher.classroom_id
     and classroom.tenant_id = teacher.tenant_id
    join public.tenants as tenant
      on tenant.id = teacher.tenant_id and tenant.active = true
    where teacher.classroom_id = p_classroom_id
      and teacher.tenant_id = public.current_tenant_id()
      and teacher.user_id = actor_id
      and teacher.member_role = 'guru'
      and classroom.academic_year = school_year
  ) then
    raise exception using errcode = '42501', message = 'classroom-forbidden';
  end if;

  select profile.nama
    into learner_name
  from public.profiles as profile
  join public.classroom_members as learner
    on learner.user_id = profile.id
  where learner.classroom_id = p_classroom_id
    and learner.tenant_id = public.current_tenant_id()
    and learner.user_id = p_student_id
    and learner.member_role = 'siswa'
    and profile.tenant_id = public.current_tenant_id()
    and profile.active = true
    and profile.role = 'siswa';
  if learner_name is null then
    raise exception using errcode = '22023', message = 'student-not-in-classroom';
  end if;

  select card.score into previous_score
  from public.learning_classroom_report_cards as card
  where card.classroom_id = p_classroom_id
    and card.student_id = p_student_id
    and card.academic_year = school_year
    and card.semester = active_semester
    and card.status = 'draft'
  for update;

  insert into public.learning_classroom_report_cards (
    tenant_id, classroom_id, student_id, academic_year, semester,
    student_name_snapshot, score, achievement_summary, created_by, updated_by
  )
  values (
    public.current_tenant_id(), p_classroom_id, p_student_id, school_year,
    active_semester, learner_name, p_score, btrim(p_achievement_summary), actor_id, actor_id
  )
  on conflict (classroom_id, student_id, academic_year, semester)
  do update set
    student_name_snapshot = excluded.student_name_snapshot,
    score = excluded.score,
    achievement_summary = excluded.achievement_summary,
    updated_by = actor_id
  where public.learning_classroom_report_cards.status = 'draft'
    and public.learning_classroom_report_cards.tenant_id = public.current_tenant_id()
  returning id into report_id;

  if report_id is null then
    raise exception using errcode = '55000', message = 'report-card-not-editable';
  end if;

  insert into public.learning_classroom_report_card_audit (
    report_card_id, tenant_id, actor_id, action, previous_score, next_score
  )
  values (
    report_id, public.current_tenant_id(), actor_id, 'draft_saved',
    previous_score, p_score
  );
  return report_id;
end;
$$;

create or replace function public.publish_learning_classroom_report_card(p_report_card_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  report public.learning_classroom_report_cards%rowtype;
begin
  if actor_id is null
    or not public.current_user_is_active()
    or public.current_app_role() <> 'admin_sekolah' then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  select * into report
  from public.learning_classroom_report_cards as card
  where card.id = p_report_card_id
    and card.tenant_id = public.current_tenant_id()
    and card.status = 'draft'
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'draft-report-card-not-found';
  end if;
  if exists (
    select 1
    from public.tenants as tenant
    where tenant.id = report.tenant_id
      and lower(btrim(coalesce(tenant.education_level, '')))
        in ('tk', 'paud', 'taman kanak-kanak')
  ) then
    raise exception using errcode = '55000', message = 'numeric-report-not-available-for-tk';
  end if;

  update public.learning_classroom_report_cards
  set status = 'published',
      published_by = actor_id,
      published_at = now(),
      updated_by = actor_id
  where id = report.id;

  insert into public.learning_classroom_report_card_audit (
    report_card_id, tenant_id, actor_id, action, previous_score, next_score
  )
  values (report.id, report.tenant_id, actor_id, 'published', report.score, report.score);
  return report.id;
end;
$$;

create or replace function public.reopen_learning_classroom_report_card(
  p_report_card_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  report public.learning_classroom_report_cards%rowtype;
  reason text := btrim(coalesce(p_reason, ''));
begin
  if actor_id is null
    or not public.current_user_is_active()
    or public.current_app_role() <> 'admin_sekolah' then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if char_length(reason) not between 10 and 500 or reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'invalid-reopen-reason';
  end if;
  select * into report
  from public.learning_classroom_report_cards as card
  where card.id = p_report_card_id
    and card.tenant_id = public.current_tenant_id()
    and card.status = 'published'
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'published-report-card-not-found';
  end if;
  if not exists (
    select 1
    from public.tenants as tenant
    where tenant.id = report.tenant_id
      and tenant.active = true
      and tenant.academic_year = report.academic_year
      and tenant.semester = report.semester
  ) then
    raise exception using errcode = '55000', message = 'report-period-not-active';
  end if;

  update public.learning_classroom_report_cards
  set status = 'draft',
      published_by = null,
      published_at = null,
      updated_by = actor_id
  where id = report.id;

  insert into public.learning_classroom_report_card_audit (
    report_card_id, tenant_id, actor_id, action, previous_score, next_score, reason
  )
  values (
    report.id, report.tenant_id, actor_id, 'reopened', report.score, report.score, reason
  );
  return report.id;
end;
$$;

revoke all on function public.save_learning_classroom_report_card_draft(uuid, uuid, numeric, text)
  from public, anon, authenticated;
revoke all on function public.publish_learning_classroom_report_card(uuid)
  from public, anon, authenticated;
revoke all on function public.reopen_learning_classroom_report_card(uuid, text)
  from public, anon, authenticated;
grant execute on function public.save_learning_classroom_report_card_draft(uuid, uuid, numeric, text)
  to authenticated;
grant execute on function public.publish_learning_classroom_report_card(uuid)
  to authenticated;
grant execute on function public.reopen_learning_classroom_report_card(uuid, text)
  to authenticated;
