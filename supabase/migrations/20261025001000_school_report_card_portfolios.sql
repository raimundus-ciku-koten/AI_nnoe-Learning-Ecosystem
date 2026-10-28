create unique index if not exists profiles_id_tenant_id_unique
  on public.profiles (id, tenant_id);

create table if not exists public.learning_school_report_card_portfolios (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete restrict,
  student_id uuid not null references public.profiles(id) on delete restrict,
  academic_year text not null check (academic_year ~ '^[0-9]{4}/[0-9]{4}$'),
  semester text not null check (semester in ('ganjil', 'genap')),
  student_name_snapshot text not null check (
    char_length(student_name_snapshot) between 1 and 120
    and student_name_snapshot = btrim(student_name_snapshot)
  ),
  student_nisn_snapshot text check (
    student_nisn_snapshot is null or student_nisn_snapshot ~ '^[0-9]{1,20}$'
  ),
  student_gender_snapshot text check (
    student_gender_snapshot is null or student_gender_snapshot in ('L', 'P')
  ),
  education_level_snapshot text not null default '' check (
    education_level_snapshot in ('', 'tk', 'sd', 'smp', 'sma')
  ),
  attendance_present smallint check (attendance_present between 0 and 366),
  attendance_excused smallint check (attendance_excused between 0 and 366),
  attendance_sick smallint check (attendance_sick between 0 and 366),
  attendance_absent smallint check (attendance_absent between 0 and 366),
  kokurikuler_summary text not null default '' check (char_length(kokurikuler_summary) <= 5000),
  development_summary text not null default '' check (char_length(development_summary) <= 5000),
  dimension_faith text not null default '' check (char_length(dimension_faith) <= 1000),
  dimension_citizenship text not null default '' check (char_length(dimension_citizenship) <= 1000),
  dimension_critical_reasoning text not null default '' check (char_length(dimension_critical_reasoning) <= 1000),
  dimension_creativity text not null default '' check (char_length(dimension_creativity) <= 1000),
  dimension_collaboration text not null default '' check (char_length(dimension_collaboration) <= 1000),
  dimension_independence text not null default '' check (char_length(dimension_independence) <= 1000),
  dimension_health text not null default '' check (char_length(dimension_health) <= 1000),
  dimension_communication text not null default '' check (char_length(dimension_communication) <= 1000),
  extracurricular_summary text not null default '' check (char_length(extracurricular_summary) <= 3000),
  achievements_summary text not null default '' check (char_length(achievements_summary) <= 3000),
  homeroom_note text not null default '' check (char_length(homeroom_note) <= 3000),
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  published_by uuid references public.profiles(id) on delete restrict,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, academic_year, semester),
  unique (id, tenant_id),
  foreign key (student_id, tenant_id)
    references public.profiles(id, tenant_id) on delete restrict,
  check ((status = 'published') = (published_by is not null)),
  check ((status = 'published') = (published_at is not null))
);

create index if not exists learning_school_report_card_portfolios_tenant_period_idx
  on public.learning_school_report_card_portfolios (tenant_id, academic_year, semester, status);
create index if not exists learning_school_report_card_portfolios_student_period_idx
  on public.learning_school_report_card_portfolios (student_id, academic_year desc, semester);

create table if not exists public.learning_school_report_card_portfolio_audit (
  id bigint generated always as identity primary key,
  portfolio_id uuid not null references public.learning_school_report_card_portfolios(id) on delete restrict,
  tenant_id text not null references public.tenants(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('draft_saved', 'published', 'reopened')),
  reason text,
  occurred_at timestamptz not null default now()
);
create index if not exists learning_school_report_card_portfolio_audit_tenant_time_idx
  on public.learning_school_report_card_portfolio_audit (tenant_id, occurred_at desc);

drop trigger if exists learning_school_report_card_portfolios_set_updated_at
  on public.learning_school_report_card_portfolios;
create trigger learning_school_report_card_portfolios_set_updated_at
  before update on public.learning_school_report_card_portfolios
  for each row execute function public.set_updated_at();

alter table public.learning_school_report_card_portfolios enable row level security;
alter table public.learning_school_report_card_portfolio_audit enable row level security;
revoke all on table public.learning_school_report_card_portfolios from public, anon, authenticated;
grant select on table public.learning_school_report_card_portfolios to authenticated;
grant all on table public.learning_school_report_card_portfolios to service_role;
revoke all on table public.learning_school_report_card_portfolio_audit from public, anon, authenticated;
grant all on table public.learning_school_report_card_portfolio_audit to service_role;

drop policy if exists "School report portfolios visible by active learning scope"
  on public.learning_school_report_card_portfolios;
create policy "School report portfolios visible by active learning scope"
  on public.learning_school_report_card_portfolios
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and tenant_id = (select public.current_tenant_id())
    and exists (
      select 1 from public.tenants as tenant
      where tenant.id = learning_school_report_card_portfolios.tenant_id
        and tenant.active = true
    )
    and (
      (select public.current_app_role()) = 'admin_sekolah'
      or (
        (select public.current_app_role()) in (
          'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
        )
        and exists (
          select 1
          from public.classroom_members as teacher
          join public.classroom_members as learner
            on learner.classroom_id = teacher.classroom_id
           and learner.tenant_id = teacher.tenant_id
          join public.learning_classrooms as classroom
            on classroom.id = teacher.classroom_id
           and classroom.tenant_id = teacher.tenant_id
          where teacher.tenant_id = learning_school_report_card_portfolios.tenant_id
            and teacher.user_id = (select auth.uid())
            and teacher.member_role = 'guru'
            and learner.user_id = learning_school_report_card_portfolios.student_id
            and learner.member_role = 'siswa'
        )
      )
      or (
        (select public.current_app_role()) = 'siswa'
        and student_id = (select auth.uid())
        and status = 'published'
        and exists (
          select 1 from public.classroom_members as learner
          where learner.tenant_id = learning_school_report_card_portfolios.tenant_id
            and learner.user_id = (select auth.uid())
            and learner.member_role = 'siswa'
        )
      )
    )
  );

create or replace function public.save_learning_school_report_card_portfolio(
  p_classroom_id uuid,
  p_student_id uuid,
  p_attendance_present smallint,
  p_attendance_excused smallint,
  p_attendance_sick smallint,
  p_attendance_absent smallint,
  p_kokurikuler_summary text,
  p_development_summary text,
  p_dimension_faith text,
  p_dimension_citizenship text,
  p_dimension_critical_reasoning text,
  p_dimension_creativity text,
  p_dimension_collaboration text,
  p_dimension_independence text,
  p_dimension_health text,
  p_dimension_communication text,
  p_extracurricular_summary text,
  p_achievements_summary text,
  p_homeroom_note text
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
  education_level text;
  learner_name text;
  learner_nisn text;
  learner_gender text;
  portfolio_id uuid;
  field_value text;
begin
  if actor_id is null
    or not public.current_user_is_active()
    or actor_role not in ('guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler') then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if p_classroom_id is null or p_student_id is null
    or (p_attendance_present is not null and p_attendance_present not between 0 and 366)
    or (p_attendance_excused is not null and p_attendance_excused not between 0 and 366)
    or (p_attendance_sick is not null and p_attendance_sick not between 0 and 366)
    or (p_attendance_absent is not null and p_attendance_absent not between 0 and 366)
    or p_kokurikuler_summary is null
    or p_development_summary is null
    or p_dimension_faith is null or p_dimension_citizenship is null
    or p_dimension_critical_reasoning is null or p_dimension_creativity is null
    or p_dimension_collaboration is null or p_dimension_independence is null
    or p_dimension_health is null or p_dimension_communication is null
    or p_extracurricular_summary is null
    or p_achievements_summary is null or p_homeroom_note is null then
    raise exception using errcode = '22023', message = 'invalid-report-portfolio';
  end if;

  foreach field_value in array array[
    p_kokurikuler_summary, p_development_summary, p_dimension_faith, p_dimension_citizenship,
    p_dimension_critical_reasoning, p_dimension_creativity,
    p_dimension_collaboration, p_dimension_independence, p_dimension_health,
    p_dimension_communication, p_extracurricular_summary,
    p_achievements_summary, p_homeroom_note
  ] loop
    if char_length(field_value) > 5000
      or translate(field_value, chr(9) || chr(10) || chr(13), '') ~ '[[:cntrl:]]' then
      raise exception using errcode = '22023', message = 'invalid-report-portfolio';
    end if;
  end loop;
  if char_length(p_dimension_faith) > 1000
    or char_length(p_dimension_citizenship) > 1000
    or char_length(p_dimension_critical_reasoning) > 1000
    or char_length(p_dimension_creativity) > 1000
    or char_length(p_dimension_collaboration) > 1000
    or char_length(p_dimension_independence) > 1000
    or char_length(p_dimension_health) > 1000
    or char_length(p_dimension_communication) > 1000
    or char_length(p_extracurricular_summary) > 3000
    or char_length(p_achievements_summary) > 3000
    or char_length(p_homeroom_note) > 3000 then
    raise exception using errcode = '22023', message = 'invalid-report-portfolio';
  end if;

  select tenant.academic_year, tenant.semester, tenant.education_level
    into school_year, active_semester, education_level
  from public.tenants as tenant
  where tenant.id = public.current_tenant_id()
    and tenant.active = true;
  if school_year is null or active_semester is null
    or active_semester not in ('ganjil', 'genap') then
    raise exception using errcode = '55000', message = 'academic-period-not-configured';
  end if;

  if not exists (
    select 1
    from public.classroom_members as teacher
    join public.classroom_members as learner
      on learner.classroom_id = teacher.classroom_id
     and learner.tenant_id = teacher.tenant_id
    join public.learning_classrooms as classroom
      on classroom.id = teacher.classroom_id
     and classroom.tenant_id = teacher.tenant_id
    where teacher.classroom_id = p_classroom_id
      and teacher.tenant_id = public.current_tenant_id()
      and teacher.user_id = actor_id
      and teacher.member_role = 'guru'
      and learner.user_id = p_student_id
      and learner.member_role = 'siswa'
      and classroom.academic_year = school_year
  ) then
    raise exception using errcode = '42501', message = 'classroom-forbidden';
  end if;

  select profile.nama into learner_name
  from public.profiles as profile
  where profile.id = p_student_id
    and profile.tenant_id = public.current_tenant_id()
    and profile.active = true
    and profile.role = 'siswa';
  if learner_name is null then
    raise exception using errcode = '22023', message = 'student-not-in-classroom';
  end if;
  select student.nisn, student.jk
    into learner_nisn, learner_gender
  from public.student_account_links as link
  join public.students as student
    on student.id = link.student_id
   and student.tenant_id = link.tenant_id
  where link.user_id = p_student_id
    and link.tenant_id = public.current_tenant_id();

  insert into public.learning_school_report_card_portfolios (
    tenant_id, student_id, academic_year, semester, student_name_snapshot,
    student_nisn_snapshot, student_gender_snapshot, education_level_snapshot,
    attendance_present, attendance_excused, attendance_sick, attendance_absent,
    kokurikuler_summary, development_summary, dimension_faith, dimension_citizenship,
    dimension_critical_reasoning, dimension_creativity, dimension_collaboration,
    dimension_independence, dimension_health, dimension_communication,
    extracurricular_summary, achievements_summary, homeroom_note,
    created_by, updated_by
  )
  values (
    public.current_tenant_id(), p_student_id, school_year, active_semester, learner_name,
    learner_nisn, learner_gender,
    case lower(btrim(coalesce(education_level, '')))
      when 'tk' then 'tk'
      when 'paud' then 'tk'
      when 'tk/paud' then 'tk'
      when 'paud/tk' then 'tk'
      when 'taman kanak-kanak' then 'tk'
      when 'sd' then 'sd'
      when 'sd/mi' then 'sd'
      when 'sekolah dasar' then 'sd'
      when 'smp' then 'smp'
      when 'smp/mts' then 'smp'
      when 'sekolah menengah pertama' then 'smp'
      when 'sma' then 'sma'
      when 'sma/ma' then 'sma'
      when 'sekolah menengah atas' then 'sma'
      else ''
    end,
    p_attendance_present, p_attendance_excused, p_attendance_sick, p_attendance_absent,
    btrim(p_kokurikuler_summary), btrim(p_development_summary),
    btrim(p_dimension_faith), btrim(p_dimension_citizenship),
    btrim(p_dimension_critical_reasoning), btrim(p_dimension_creativity),
    btrim(p_dimension_collaboration), btrim(p_dimension_independence),
    btrim(p_dimension_health), btrim(p_dimension_communication),
    btrim(p_extracurricular_summary), btrim(p_achievements_summary),
    btrim(p_homeroom_note), actor_id, actor_id
  )
  on conflict (student_id, academic_year, semester)
  do update set
    student_name_snapshot = excluded.student_name_snapshot,
    student_nisn_snapshot = excluded.student_nisn_snapshot,
    student_gender_snapshot = excluded.student_gender_snapshot,
    education_level_snapshot = excluded.education_level_snapshot,
    attendance_present = excluded.attendance_present,
    attendance_excused = excluded.attendance_excused,
    attendance_sick = excluded.attendance_sick,
    attendance_absent = excluded.attendance_absent,
    kokurikuler_summary = excluded.kokurikuler_summary,
    development_summary = excluded.development_summary,
    dimension_faith = excluded.dimension_faith,
    dimension_citizenship = excluded.dimension_citizenship,
    dimension_critical_reasoning = excluded.dimension_critical_reasoning,
    dimension_creativity = excluded.dimension_creativity,
    dimension_collaboration = excluded.dimension_collaboration,
    dimension_independence = excluded.dimension_independence,
    dimension_health = excluded.dimension_health,
    dimension_communication = excluded.dimension_communication,
    extracurricular_summary = excluded.extracurricular_summary,
    achievements_summary = excluded.achievements_summary,
    homeroom_note = excluded.homeroom_note,
    updated_by = actor_id
  where public.learning_school_report_card_portfolios.status = 'draft'
    and public.learning_school_report_card_portfolios.tenant_id = public.current_tenant_id()
  returning id into portfolio_id;

  if portfolio_id is null then
    raise exception using errcode = '55000', message = 'report-portfolio-not-editable';
  end if;
  insert into public.learning_school_report_card_portfolio_audit (
    portfolio_id, tenant_id, actor_id, action
  )
  values (portfolio_id, public.current_tenant_id(), actor_id, 'draft_saved');
  return portfolio_id;
end;
$$;

create or replace function public.publish_learning_school_report_card_portfolio(p_portfolio_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  portfolio public.learning_school_report_card_portfolios%rowtype;
  school_level text;
begin
  if actor_id is null
    or not public.current_user_is_active()
    or public.current_app_role() <> 'admin_sekolah' then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  select * into portfolio
  from public.learning_school_report_card_portfolios as item
  where item.id = p_portfolio_id
    and item.tenant_id = public.current_tenant_id()
    and item.status = 'draft'
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'draft-report-portfolio-not-found';
  end if;
  school_level := lower(btrim(coalesce(portfolio.education_level_snapshot, '')));
  if school_level = 'tk' then
    if btrim(portfolio.development_summary) = '' then
      raise exception using errcode = '55000', message = 'report-development-not-ready';
    end if;
  elsif not exists (
    select 1
    from public.learning_classroom_report_cards as card
    where card.tenant_id = portfolio.tenant_id
      and card.student_id = portfolio.student_id
      and card.academic_year = portfolio.academic_year
      and card.semester = portfolio.semester
      and card.status = 'published'
  ) or exists (
    select 1
    from public.classroom_members as learner
    join public.learning_classrooms as classroom
      on classroom.id = learner.classroom_id
     and classroom.tenant_id = learner.tenant_id
    where learner.tenant_id = portfolio.tenant_id
      and learner.user_id = portfolio.student_id
      and learner.member_role = 'siswa'
      and classroom.academic_year = portfolio.academic_year
      and classroom.subject is not null
      and not exists (
        select 1
        from public.learning_classroom_report_cards as card
        where card.tenant_id = portfolio.tenant_id
          and card.classroom_id = classroom.id
          and card.student_id = portfolio.student_id
          and card.academic_year = portfolio.academic_year
          and card.semester = portfolio.semester
          and card.status = 'published'
      )
  ) or exists (
    select 1
    from public.learning_classroom_report_cards as card
    where card.tenant_id = portfolio.tenant_id
      and card.student_id = portfolio.student_id
      and card.academic_year = portfolio.academic_year
      and card.semester = portfolio.semester
      and card.status = 'draft'
  ) then
    raise exception using errcode = '55000', message = 'subject-reports-not-ready';
  end if;
  update public.learning_school_report_card_portfolios
  set status = 'published',
      published_by = actor_id,
      published_at = now(),
      updated_by = actor_id
  where id = portfolio.id;
  insert into public.learning_school_report_card_portfolio_audit (
    portfolio_id, tenant_id, actor_id, action
  )
  values (portfolio.id, portfolio.tenant_id, actor_id, 'published');
  return portfolio.id;
end;
$$;

create or replace function public.reopen_learning_school_report_card_portfolio(
  p_portfolio_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  portfolio public.learning_school_report_card_portfolios%rowtype;
  reason text := btrim(coalesce(p_reason, ''));
begin
  if actor_id is null
    or not public.current_user_is_active()
    or public.current_app_role() <> 'admin_sekolah' then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if char_length(reason) not between 10 and 500
    or translate(reason, chr(9) || chr(10) || chr(13), '') ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'invalid-reopen-reason';
  end if;
  select * into portfolio
  from public.learning_school_report_card_portfolios as item
  where item.id = p_portfolio_id
    and item.tenant_id = public.current_tenant_id()
    and item.status = 'published'
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'published-report-portfolio-not-found';
  end if;
  if not exists (
    select 1 from public.tenants as tenant
    where tenant.id = portfolio.tenant_id
      and tenant.active = true
      and tenant.academic_year = portfolio.academic_year
      and tenant.semester = portfolio.semester
  ) then
    raise exception using errcode = '55000', message = 'report-period-not-active';
  end if;
  update public.learning_school_report_card_portfolios
  set status = 'draft',
      published_by = null,
      published_at = null,
      updated_by = actor_id
  where id = portfolio.id;
  insert into public.learning_school_report_card_portfolio_audit (
    portfolio_id, tenant_id, actor_id, action, reason
  )
  values (portfolio.id, portfolio.tenant_id, actor_id, 'reopened', reason);
  return portfolio.id;
end;
$$;

revoke all on function public.save_learning_school_report_card_portfolio(
  uuid, uuid, smallint, smallint, smallint, smallint, text, text, text, text,
  text, text, text, text, text, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.publish_learning_school_report_card_portfolio(uuid)
  from public, anon, authenticated;
revoke all on function public.reopen_learning_school_report_card_portfolio(uuid, text)
  from public, anon, authenticated;
grant execute on function public.save_learning_school_report_card_portfolio(
  uuid, uuid, smallint, smallint, smallint, smallint, text, text, text, text,
  text, text, text, text, text, text, text, text, text
) to authenticated;
grant execute on function public.publish_learning_school_report_card_portfolio(uuid)
  to authenticated;
grant execute on function public.reopen_learning_school_report_card_portfolio(uuid, text)
  to authenticated;
