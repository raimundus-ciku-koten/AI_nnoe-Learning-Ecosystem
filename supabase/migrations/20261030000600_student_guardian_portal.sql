create table if not exists public.student_guardian_links (
  student_id uuid not null references public.students(id) on delete cascade,
  guardian_user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id text not null references public.tenants(id) on delete restrict,
  relationship text not null check (relationship in ('ibu', 'ayah', 'wali')),
  linked_by uuid not null references auth.users(id) on delete restrict,
  linked_at timestamptz not null default now(),
  primary key (student_id, guardian_user_id),
  check (student_id is not null and guardian_user_id is not null)
);

create index if not exists student_guardian_links_guardian_idx
  on public.student_guardian_links (guardian_user_id, tenant_id, linked_at desc);

create table if not exists public.student_guardian_link_audit (
  id bigint generated always as identity primary key,
  student_id uuid not null,
  guardian_user_id uuid not null,
  tenant_id text not null,
  actor_id uuid not null,
  relationship text not null check (relationship in ('ibu', 'ayah', 'wali')),
  action text not null check (action in ('linked', 'unlinked')),
  occurred_at timestamptz not null default now()
);

alter table public.student_guardian_links enable row level security;
alter table public.student_guardian_link_audit enable row level security;
revoke all on table public.student_guardian_links, public.student_guardian_link_audit
  from public, anon, authenticated;
grant all on table public.student_guardian_links, public.student_guardian_link_audit
  to service_role;

create or replace function public.can_manage_student_guardian_links()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and (select public.current_user_is_active())
    and (select public.current_app_role()) = 'admin_sekolah'
    and exists (
      select 1 from public.tenants as tenant
      where tenant.id = (select public.current_tenant_id())
        and tenant.active = true
    )
$$;

create or replace function public.can_read_student_guardian_portal()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and (select public.current_user_is_active())
    and (select public.current_app_role()) in ('ortu', 'orang_tua')
    and exists (
      select 1 from public.tenants as tenant
      where tenant.id = (select public.current_tenant_id())
        and tenant.active = true
    )
$$;

revoke all on function public.can_manage_student_guardian_links()
  from public, anon;
revoke all on function public.can_read_student_guardian_portal()
  from public, anon;
grant execute on function public.can_manage_student_guardian_links() to authenticated;
grant execute on function public.can_read_student_guardian_portal() to authenticated;

create or replace function public.admin_guardian_accounts()
returns table (user_id uuid, nama text, email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.can_manage_student_guardian_links()) then
    raise exception 'Hanya admin sekolah aktif yang dapat mengelola tautan orang tua.'
      using errcode = '42501';
  end if;

  return query
  select profile.id, profile.nama, coalesce(profile.email, '')
  from public.profiles as profile
  where profile.tenant_id = (select public.current_tenant_id())
    and profile.active = true
    and (
      profile.role in ('ortu', 'orang_tua')
      or profile.roles && array['ortu', 'orang_tua']::text[]
    )
  order by profile.nama, profile.id;
end;
$$;

create or replace function public.admin_guardian_students()
returns table (student_id uuid, nama text, kelas text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.can_manage_student_guardian_links()) then
    raise exception 'Hanya admin sekolah aktif yang dapat mengelola tautan orang tua.'
      using errcode = '42501';
  end if;

  return query
  select student.id, student.nama, student.kelas
  from public.students as student
  where student.tenant_id = (select public.current_tenant_id())
    and exists (
      select 1 from public.tenants as tenant
      where tenant.id = student.tenant_id and tenant.active = true
    )
  order by student.kelas, student.nama, student.id;
end;
$$;

create or replace function public.admin_student_guardian_links()
returns table (
  student_id uuid,
  student_nama text,
  kelas text,
  guardian_user_id uuid,
  guardian_nama text,
  guardian_email text,
  relationship text,
  linked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.can_manage_student_guardian_links()) then
    raise exception 'Hanya admin sekolah aktif yang dapat melihat tautan orang tua.'
      using errcode = '42501';
  end if;

  return query
  select link.student_id, student.nama, student.kelas, link.guardian_user_id,
    profile.nama, coalesce(profile.email, ''), link.relationship, link.linked_at
  from public.student_guardian_links as link
  join public.students as student on student.id = link.student_id
  join public.profiles as profile on profile.id = link.guardian_user_id
  where link.tenant_id = (select public.current_tenant_id())
    and profile.tenant_id = link.tenant_id
  order by student.kelas, student.nama, profile.nama;
end;
$$;

create or replace function public.link_student_guardian(
  p_student_id uuid,
  p_guardian_user_id uuid,
  p_relationship text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id text := (select public.current_tenant_id());
begin
  if not (select public.can_manage_student_guardian_links()) then
    raise exception 'Hanya admin sekolah aktif yang dapat menautkan orang tua.'
      using errcode = '42501';
  end if;
  if p_student_id is null or p_guardian_user_id is null or p_relationship is null
    or p_relationship not in ('ibu', 'ayah', 'wali') then
    raise exception 'Data tautan orang tua tidak valid.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.students as student
    where student.id = p_student_id and student.tenant_id = v_tenant_id
  ) then
    raise exception 'Siswa tidak ditemukan pada sekolah ini.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles as profile
    where profile.id = p_guardian_user_id
      and profile.tenant_id = v_tenant_id
      and profile.active = true
      and (
        profile.role in ('ortu', 'orang_tua')
        or profile.roles && array['ortu', 'orang_tua']::text[]
      )
  ) then
    raise exception 'Akun orang tua harus aktif pada sekolah yang sama.' using errcode = '22023';
  end if;

  insert into public.student_guardian_links (
    student_id, guardian_user_id, tenant_id, relationship, linked_by
  ) values (
    p_student_id, p_guardian_user_id, v_tenant_id, p_relationship, auth.uid()
  );
  insert into public.student_guardian_link_audit (
    student_id, guardian_user_id, tenant_id, actor_id, relationship, action
  ) values (
    p_student_id, p_guardian_user_id, v_tenant_id, auth.uid(), p_relationship, 'linked'
  );
end;
$$;

create or replace function public.unlink_student_guardian(
  p_student_id uuid,
  p_guardian_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed public.student_guardian_links%rowtype;
begin
  if not (select public.can_manage_student_guardian_links()) then
    raise exception 'Hanya admin sekolah aktif yang dapat melepas tautan orang tua.'
      using errcode = '42501';
  end if;
  if p_student_id is null or p_guardian_user_id is null then
    raise exception 'Data tautan orang tua tidak valid.' using errcode = '22023';
  end if;

  delete from public.student_guardian_links as link
  where link.student_id = p_student_id
    and link.guardian_user_id = p_guardian_user_id
    and link.tenant_id = (select public.current_tenant_id())
  returning link.* into removed;

  if removed.student_id is null then
    raise exception 'Tautan orang tua tidak ditemukan pada sekolah ini.' using errcode = '22023';
  end if;
  insert into public.student_guardian_link_audit (
    student_id, guardian_user_id, tenant_id, actor_id, relationship, action
  ) values (
    removed.student_id, removed.guardian_user_id, removed.tenant_id,
    auth.uid(), removed.relationship, 'unlinked'
  );
end;
$$;

create or replace function public.parent_linked_students()
returns table (
  student_id uuid,
  nama text,
  kelas text,
  relationship text,
  linked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.can_read_student_guardian_portal()) then
    raise exception 'Akun orang tua aktif diperlukan.' using errcode = '42501';
  end if;

  return query
  select student.id, student.nama, student.kelas, link.relationship, link.linked_at
  from public.student_guardian_links as link
  join public.students as student on student.id = link.student_id and student.tenant_id = link.tenant_id
  join public.tenants as tenant on tenant.id = link.tenant_id and tenant.active = true
  where link.guardian_user_id = auth.uid()
    and link.tenant_id = (select public.current_tenant_id())
  order by student.nama, student.id;
end;
$$;

create or replace function public.parent_student_attendance(p_student_id uuid)
returns table (tanggal date, status text, waktu timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.can_read_student_guardian_portal()) then
    raise exception 'Akun orang tua aktif diperlukan.' using errcode = '42501';
  end if;
  if p_student_id is null or not exists (
    select 1 from public.student_guardian_links as link
    where link.student_id = p_student_id
      and link.guardian_user_id = auth.uid()
      and link.tenant_id = (select public.current_tenant_id())
  ) then
    raise exception 'Siswa tidak tertaut ke akun orang tua ini.' using errcode = '42501';
  end if;

  return query
  select attendance.tanggal, attendance.status, attendance.waktu
  from public.attendance_records as attendance
  join public.tenants as tenant on tenant.id = attendance.tenant_id and tenant.active = true
  where attendance.student_id = p_student_id
    and attendance.tenant_id = (select public.current_tenant_id())
  order by attendance.tanggal desc, attendance.waktu desc
  limit 100;
end;
$$;

create or replace function public.parent_student_exam_results(p_student_id uuid)
returns table (
  exam_id uuid,
  title text,
  kelas text,
  submitted_at timestamptz,
  score numeric,
  grade_pending boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.can_read_student_guardian_portal()) then
    raise exception 'Akun orang tua aktif diperlukan.' using errcode = '42501';
  end if;
  if p_student_id is null or not exists (
    select 1 from public.student_guardian_links as link
    where link.student_id = p_student_id
      and link.guardian_user_id = auth.uid()
      and link.tenant_id = (select public.current_tenant_id())
  ) then
    raise exception 'Siswa tidak tertaut ke akun orang tua ini.' using errcode = '42501';
  end if;

  return query
  select exam.id, exam.title, exam.kelas, attempt.submitted_at,
    case when attempt.grade_pending then null else attempt.score end,
    attempt.grade_pending
  from public.student_guardian_links as link
  join public.students as student on student.id = link.student_id and student.tenant_id = link.tenant_id
  join public.online_exam_attempts as attempt on attempt.student_id = student.id
  join public.online_exams as exam on exam.id = attempt.exam_id and exam.tenant_id = student.tenant_id
  join public.tenants as tenant on tenant.id = exam.tenant_id and tenant.active = true
  where link.student_id = p_student_id
    and link.guardian_user_id = auth.uid()
    and link.tenant_id = (select public.current_tenant_id())
    and attempt.submitted_at is not null
    and exam.ends_at <= now()
  order by attempt.submitted_at desc, exam.id;
end;
$$;

revoke all on function public.admin_guardian_accounts() from public, anon;
revoke all on function public.admin_guardian_students() from public, anon;
revoke all on function public.admin_student_guardian_links() from public, anon;
revoke all on function public.link_student_guardian(uuid, uuid, text) from public, anon;
revoke all on function public.unlink_student_guardian(uuid, uuid) from public, anon;
revoke all on function public.parent_linked_students() from public, anon;
revoke all on function public.parent_student_attendance(uuid) from public, anon;
revoke all on function public.parent_student_exam_results(uuid) from public, anon;
grant execute on function public.admin_guardian_accounts() to authenticated;
grant execute on function public.admin_guardian_students() to authenticated;
grant execute on function public.admin_student_guardian_links() to authenticated;
grant execute on function public.link_student_guardian(uuid, uuid, text) to authenticated;
grant execute on function public.unlink_student_guardian(uuid, uuid) to authenticated;
grant execute on function public.parent_linked_students() to authenticated;
grant execute on function public.parent_student_attendance(uuid) to authenticated;
grant execute on function public.parent_student_exam_results(uuid) to authenticated;