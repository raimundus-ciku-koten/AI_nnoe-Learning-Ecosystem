create or replace function public.classroom_rubric_criteria_valid(p_criteria jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_criteria) is distinct from 'array' then false
    when jsonb_array_length(p_criteria) not between 1 and 12 then false
    else
      not exists (
        select 1
        from jsonb_array_elements(p_criteria) as item(value)
        where jsonb_typeof(item.value) is distinct from 'object'
          or jsonb_typeof(item.value -> 'name') is distinct from 'string'
          or char_length(btrim(item.value ->> 'name')) not between 1 and 120
          or jsonb_typeof(item.value -> 'levels') is distinct from 'object'
          or exists (
            select 1
            from unnest(array['1', '2', '3', '4']) as level(key)
            where jsonb_typeof(item.value -> 'levels' -> level.key)
                is distinct from 'string'
              or char_length(btrim(item.value -> 'levels' ->> level.key))
                not between 1 and 500
          )
      )
      and (
        select count(*) = count(distinct btrim(item.value ->> 'name'))
        from jsonb_array_elements(p_criteria) as item(value)
      )
  end
$$;

revoke all on function public.classroom_rubric_criteria_valid(jsonb)
  from public, anon;
grant execute on function public.classroom_rubric_criteria_valid(jsonb)
  to authenticated, service_role;

create table if not exists public.classroom_rubrics (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete restrict,
  classroom_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete restrict,
  title text not null check (
    char_length(btrim(title)) between 1 and 160
    and title !~ '[[:cntrl:]]'
  ),
  created_at timestamptz not null default now(),
  foreign key (classroom_id, tenant_id)
    references public.learning_classrooms(id, tenant_id) on delete restrict,
  unique (id, tenant_id)
);

create table if not exists public.classroom_rubric_versions (
  id uuid primary key default gen_random_uuid(),
  rubric_id uuid not null,
  tenant_id text not null references public.tenants(id) on delete restrict,
  version integer not null check (version between 1 and 10000),
  summary text not null default '' check (char_length(summary) <= 2000),
  criteria jsonb not null check (
    public.classroom_rubric_criteria_valid(criteria)
  ),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (rubric_id, tenant_id)
    references public.classroom_rubrics(id, tenant_id) on delete restrict,
  unique (rubric_id, version)
);

create index if not exists classroom_rubrics_class_owner_idx
  on public.classroom_rubrics (tenant_id, classroom_id, owner_id, created_at desc);
create index if not exists classroom_rubric_versions_history_idx
  on public.classroom_rubric_versions (tenant_id, rubric_id, version desc);

alter table public.classroom_rubrics enable row level security;
alter table public.classroom_rubric_versions enable row level security;

revoke all on table public.classroom_rubrics, public.classroom_rubric_versions
  from public, anon, authenticated;
grant select on table public.classroom_rubrics, public.classroom_rubric_versions
  to authenticated;
grant all on table public.classroom_rubrics, public.classroom_rubric_versions
  to service_role;

create or replace function public.current_user_is_assigned_class_teacher(
  p_classroom_id uuid,
  p_tenant_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and (select public.current_user_is_active())
    and p_tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in (
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
    and exists (
      select 1
      from public.tenants as tenant
      join public.classroom_members as member
        on member.tenant_id = tenant.id
       and member.classroom_id = p_classroom_id
       and member.user_id = (select auth.uid())
       and member.member_role = 'guru'
      where tenant.id = p_tenant_id
        and tenant.active = true
    )
$$;

revoke all on function public.current_user_is_assigned_class_teacher(uuid, text)
  from public, anon;
grant execute on function public.current_user_is_assigned_class_teacher(uuid, text)
  to authenticated, service_role;

drop policy if exists "Assigned teachers read classroom rubrics"
  on public.classroom_rubrics;
create policy "Assigned teachers read classroom rubrics"
  on public.classroom_rubrics
  for select
  to authenticated
  using (
    (select public.current_user_is_assigned_class_teacher(classroom_id, tenant_id))
  );

drop policy if exists "Assigned teachers read classroom rubric versions"
  on public.classroom_rubric_versions;
create policy "Assigned teachers read classroom rubric versions"
  on public.classroom_rubric_versions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.classroom_rubrics as rubric
      where rubric.id = classroom_rubric_versions.rubric_id
        and rubric.tenant_id = classroom_rubric_versions.tenant_id
        and (select public.current_user_is_assigned_class_teacher(
          rubric.classroom_id, rubric.tenant_id
        ))
    )
  );

create or replace function public.create_classroom_rubric(
  p_classroom_id uuid,
  p_title text,
  p_summary text,
  p_criteria jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_rubric_id uuid;
  active_tenant text := (select public.current_tenant_id());
begin
  if auth.uid() is null
    or not (select public.current_user_is_assigned_class_teacher(
      p_classroom_id, active_tenant
    ))
  then
    raise exception 'Guru aktif yang ditugaskan ke kelas diperlukan.'
      using errcode = '42501';
  end if;

  if p_title is null or char_length(btrim(p_title)) not between 1 and 160
    or p_title ~ '[[:cntrl:]]'
    or p_summary is null or char_length(p_summary) > 2000
    or not public.classroom_rubric_criteria_valid(p_criteria)
  then
    raise exception 'Judul, ringkasan, atau kriteria rubrik tidak valid.'
      using errcode = '22023';
  end if;

  insert into public.classroom_rubrics (
    tenant_id, classroom_id, owner_id, title
  )
  values (active_tenant, p_classroom_id, auth.uid(), btrim(p_title))
  returning id into new_rubric_id;

  insert into public.classroom_rubric_versions (
    rubric_id, tenant_id, version, summary, criteria, created_by
  )
  values (new_rubric_id, active_tenant, 1, btrim(p_summary), p_criteria, auth.uid());

  return new_rubric_id;
end;
$$;

create or replace function public.create_classroom_rubric_version(
  p_rubric_id uuid,
  p_title text,
  p_summary text,
  p_criteria jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_rubric public.classroom_rubrics%rowtype;
  next_version integer;
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) not in (
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
  then
    raise exception 'Guru aktif diperlukan untuk membuat versi rubrik.'
      using errcode = '42501';
  end if;

  select rubric.*
    into selected_rubric
  from public.classroom_rubrics as rubric
  where rubric.id = p_rubric_id
    and rubric.tenant_id = (select public.current_tenant_id())
    and rubric.owner_id = auth.uid()
    and (select public.current_user_is_assigned_class_teacher(
      rubric.classroom_id, rubric.tenant_id
    ))
  for update;

  if selected_rubric.id is null then
    raise exception 'Rubrik tidak ditemukan, bukan milik Anda, atau kelas tidak lagi ditugaskan.'
      using errcode = '42501';
  end if;

  if p_title is null or char_length(btrim(p_title)) not between 1 and 160
    or p_title ~ '[[:cntrl:]]'
    or p_summary is null or char_length(p_summary) > 2000
    or not public.classroom_rubric_criteria_valid(p_criteria)
  then
    raise exception 'Judul, ringkasan, atau kriteria rubrik tidak valid.'
      using errcode = '22023';
  end if;

  select coalesce(max(version), 0) + 1
    into next_version
  from public.classroom_rubric_versions
  where rubric_id = selected_rubric.id;

  if next_version > 10000 then
    raise exception 'Batas versi rubrik telah tercapai.'
      using errcode = '22023';
  end if;

  insert into public.classroom_rubric_versions (
    rubric_id, tenant_id, version, summary, criteria, created_by
  )
  values (
    selected_rubric.id,
    selected_rubric.tenant_id,
    next_version,
    btrim(p_summary),
    p_criteria,
    auth.uid()
  );

  update public.classroom_rubrics
  set title = btrim(p_title)
  where id = selected_rubric.id;

  return next_version;
end;
$$;

revoke all on function public.create_classroom_rubric(uuid, text, text, jsonb)
  from public, anon;
revoke all on function public.create_classroom_rubric_version(uuid, text, text, jsonb)
  from public, anon;
grant execute on function public.create_classroom_rubric(uuid, text, text, jsonb)
  to authenticated, service_role;
grant execute on function public.create_classroom_rubric_version(uuid, text, text, jsonb)
  to authenticated, service_role;
