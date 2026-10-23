create table if not exists public.guardian_student_links (
  guardian_user_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  tenant_id text not null references public.tenants(id) on delete restrict,
  linked_by uuid not null references auth.users(id) on delete restrict,
  linked_at timestamptz not null default now(),
  primary key (guardian_user_id, student_id)
);

create table if not exists public.guardian_student_link_audit (
  id bigint generated always as identity primary key,
  guardian_user_id uuid not null,
  student_id uuid not null,
  tenant_id text not null,
  actor_id uuid not null,
  action text not null check (action in ('linked', 'unlinked')),
  relationship_verified boolean not null default false,
  occurred_at timestamptz not null default now()
);

create index if not exists guardian_student_links_student_idx
  on public.guardian_student_links (tenant_id, student_id);

alter table public.guardian_student_links enable row level security;
alter table public.guardian_student_link_audit enable row level security;

revoke all on table public.guardian_student_links, public.guardian_student_link_audit
  from public, anon, authenticated;
grant all on table public.guardian_student_links, public.guardian_student_link_audit
  to service_role;

create or replace function public.guardian_accounts()
returns table (user_id uuid, email text, nama text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'admin_sekolah'
    or not exists (
      select 1
      from public.profiles as actor
      where actor.id = auth.uid()
        and actor.active = true
        and actor.role = 'admin_sekolah'
        and actor.tenant_id = (select public.current_tenant_id())
    )
  then
    raise exception 'Hanya admin sekolah aktif yang dapat melihat akun wali.'
      using errcode = '42501';
  end if;

  return query
  select profile.id, profile.email, profile.nama
  from public.profiles as profile
  join public.tenants as tenant
    on tenant.id = profile.tenant_id and tenant.active = true
  where profile.tenant_id = (select public.current_tenant_id())
    and profile.role in ('ortu', 'orang_tua')
    and profile.active = true
  order by profile.nama, profile.email;
end;
$$;

create or replace function public.guardian_student_roster()
returns table (student_id uuid, nama text, kelas text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'admin_sekolah'
    or not exists (
      select 1
      from public.profiles as actor
      where actor.id = auth.uid()
        and actor.active = true
        and actor.role = 'admin_sekolah'
        and actor.tenant_id = (select public.current_tenant_id())
    )
  then
    raise exception 'Hanya admin sekolah aktif yang dapat melihat roster wali.'
      using errcode = '42501';
  end if;

  return query
  select student.id, student.nama, student.kelas
  from public.students as student
  join public.tenants as tenant
    on tenant.id = student.tenant_id and tenant.active = true
  where student.tenant_id = (select public.current_tenant_id())
  order by student.kelas, student.nama;
end;
$$;

create or replace function public.link_guardian_to_student(
  p_guardian_user_id uuid,
  p_student_id uuid,
  p_relationship_verified boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_tenant text;
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'admin_sekolah'
    or not exists (
      select 1
      from public.profiles as actor
      where actor.id = auth.uid()
        and actor.active = true
        and actor.role = 'admin_sekolah'
        and actor.tenant_id = (select public.current_tenant_id())
    )
  then
    raise exception 'Hanya admin sekolah aktif yang dapat menautkan wali.'
      using errcode = '42501';
  end if;
  if p_relationship_verified is distinct from true then
    raise exception 'Verifikasi hubungan wali oleh sekolah wajib dikonfirmasi.'
      using errcode = '22023';
  end if;

  select student.tenant_id
    into selected_tenant
  from public.students as student
  join public.tenants as tenant
    on tenant.id = student.tenant_id and tenant.active = true
  where student.id = p_student_id
    and student.tenant_id = (select public.current_tenant_id())
  for update of student;

  if selected_tenant is null or not exists (
    select 1
    from public.profiles as profile
    where profile.id = p_guardian_user_id
      and profile.tenant_id = selected_tenant
      and profile.role in ('ortu', 'orang_tua')
      and profile.active = true
  ) then
    raise exception 'Siswa dan akun wali harus aktif pada sekolah yang sama.'
      using errcode = '22023';
  end if;

  insert into public.guardian_student_links (
    guardian_user_id, student_id, tenant_id, linked_by
  )
  values (p_guardian_user_id, p_student_id, selected_tenant, auth.uid());

  insert into public.guardian_student_link_audit (
    guardian_user_id, student_id, tenant_id, actor_id, action, relationship_verified
  )
  values (p_guardian_user_id, p_student_id, selected_tenant, auth.uid(), 'linked', true);
end;
$$;

create or replace function public.linked_guardian_student_accounts()
returns table (
  guardian_user_id uuid,
  guardian_email text,
  guardian_nama text,
  student_id uuid,
  student_nama text,
  student_kelas text,
  linked_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'admin_sekolah'
    or not exists (
      select 1
      from public.profiles as actor
      where actor.id = auth.uid()
        and actor.active = true
        and actor.role = 'admin_sekolah'
        and actor.tenant_id = (select public.current_tenant_id())
    )
  then
    raise exception 'Hanya admin sekolah aktif yang dapat melihat tautan wali.'
      using errcode = '42501';
  end if;

  return query
  select profile.id, profile.email, profile.nama,
    student.id, student.nama, student.kelas, link.linked_at
  from public.guardian_student_links as link
  join public.profiles as profile
    on profile.id = link.guardian_user_id
    and profile.tenant_id = link.tenant_id
    and profile.active = true
  join public.students as student
    on student.id = link.student_id
    and student.tenant_id = link.tenant_id
  join public.tenants as tenant
    on tenant.id = link.tenant_id and tenant.active = true
  where link.tenant_id = (select public.current_tenant_id())
  order by profile.nama, student.kelas, student.nama;
end;
$$;

create or replace function public.unlink_guardian_from_student(
  p_guardian_user_id uuid,
  p_student_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed_link public.guardian_student_links%rowtype;
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'admin_sekolah'
    or not exists (
      select 1
      from public.profiles as actor
      where actor.id = auth.uid()
        and actor.active = true
        and actor.role = 'admin_sekolah'
        and actor.tenant_id = (select public.current_tenant_id())
    )
  then
    raise exception 'Hanya admin sekolah aktif yang dapat melepas tautan wali.'
      using errcode = '42501';
  end if;

  delete from public.guardian_student_links as link
  where link.guardian_user_id = p_guardian_user_id
    and link.student_id = p_student_id
    and link.tenant_id = (select public.current_tenant_id())
  returning link.* into removed_link;

  if removed_link.guardian_user_id is null then
    raise exception 'Tautan wali tidak ditemukan pada sekolah ini.'
      using errcode = 'P0002';
  end if;

  insert into public.guardian_student_link_audit (
    guardian_user_id, student_id, tenant_id, actor_id, action
  )
  values (
    removed_link.guardian_user_id,
    removed_link.student_id,
    removed_link.tenant_id,
    auth.uid(),
    'unlinked'
  );
end;
$$;

create or replace function public.parent_children_overview()
returns table (
  student_id uuid,
  nama text,
  kelas text,
  attendance_present_count bigint,
  last_present_on date,
  submitted_exam_count bigint,
  pending_grade_count bigint,
  average_exam_score numeric
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) not in ('ortu', 'orang_tua')
    or not exists (
      select 1
      from public.profiles as guardian
      where guardian.id = auth.uid()
        and guardian.active = true
        and guardian.role in ('ortu', 'orang_tua')
        and guardian.tenant_id = (select public.current_tenant_id())
    )
  then
    raise exception 'Akun wali aktif diperlukan.'
      using errcode = '42501';
  end if;

  return query
  select
    student.id,
    student.nama,
    student.kelas,
    (
      select count(*)
      from public.attendance_records as attendance
      where attendance.student_id = student.id
        and attendance.tenant_id = link.tenant_id
        and attendance.status = 'hadir'
    ),
    (
      select max(attendance.tanggal)
      from public.attendance_records as attendance
      where attendance.student_id = student.id
        and attendance.tenant_id = link.tenant_id
        and attendance.status = 'hadir'
    ),
    (
      select count(*)
      from public.online_exam_attempts as attempt
      join public.online_exams as exam
        on exam.id = attempt.exam_id and exam.tenant_id = link.tenant_id
      where attempt.student_id = student.id
        and attempt.submitted_at is not null
    ),
    (
      select count(*)
      from public.online_exam_attempts as attempt
      join public.online_exams as exam
        on exam.id = attempt.exam_id and exam.tenant_id = link.tenant_id
      where attempt.student_id = student.id
        and attempt.submitted_at is not null
        and attempt.grade_pending = true
    ),
    (
      select round(avg(attempt.score), 2)
      from public.online_exam_attempts as attempt
      join public.online_exams as exam
        on exam.id = attempt.exam_id and exam.tenant_id = link.tenant_id
      where attempt.student_id = student.id
        and attempt.submitted_at is not null
        and attempt.grade_pending = false
    )
  from public.guardian_student_links as link
  join public.profiles as guardian
    on guardian.id = link.guardian_user_id
    and guardian.tenant_id = link.tenant_id
    and guardian.active = true
    and guardian.role in ('ortu', 'orang_tua')
  join public.students as student
    on student.id = link.student_id and student.tenant_id = link.tenant_id
  join public.tenants as tenant
    on tenant.id = link.tenant_id and tenant.active = true
  where link.guardian_user_id = auth.uid()
    and link.tenant_id = (select public.current_tenant_id())
  order by student.kelas, student.nama;
end;
$$;

revoke all on function public.guardian_accounts() from public, anon;
revoke all on function public.guardian_student_roster() from public, anon;
revoke all on function public.link_guardian_to_student(uuid, uuid, boolean) from public, anon;
revoke all on function public.linked_guardian_student_accounts() from public, anon;
revoke all on function public.unlink_guardian_from_student(uuid, uuid) from public, anon;
revoke all on function public.parent_children_overview() from public, anon;
grant execute on function public.guardian_accounts() to authenticated;
grant execute on function public.guardian_student_roster() to authenticated;
grant execute on function public.link_guardian_to_student(uuid, uuid, boolean) to authenticated;
grant execute on function public.linked_guardian_student_accounts() to authenticated;
grant execute on function public.unlink_guardian_from_student(uuid, uuid) to authenticated;
grant execute on function public.parent_children_overview() to authenticated;
