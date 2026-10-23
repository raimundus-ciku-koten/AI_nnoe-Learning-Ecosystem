create table if not exists public.school_learning_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete restrict,
  author_id uuid not null references auth.users(id) on delete restrict,
  class_name text not null check (
    char_length(class_name) between 1 and 30
    and class_name = btrim(class_name)
    and class_name !~ '[[:cntrl:]]'
  ),
  kind text not null check (kind in ('schedule', 'task', 'material')),
  title text not null check (
    char_length(title) between 1 and 200
    and title = btrim(title)
    and title !~ '[[:cntrl:]]'
  ),
  body text not null check (
    char_length(body) between 1 and 10000
    and body = btrim(body)
  ),
  starts_at timestamptz,
  due_at timestamptz,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (kind = 'schedule' and starts_at is not null)
    or (kind = 'task' and due_at is not null)
    or (kind = 'material' and starts_at is null and due_at is null)
  ),
  check (due_at is null or starts_at is null or due_at >= starts_at)
);

create index if not exists school_learning_items_tenant_class_kind_idx
  on public.school_learning_items (tenant_id, class_name, kind, published, starts_at);

drop trigger if exists school_learning_items_set_updated_at
  on public.school_learning_items;
create trigger school_learning_items_set_updated_at
  before update on public.school_learning_items
  for each row execute function public.set_updated_at();

alter table public.school_learning_items enable row level security;

revoke all on table public.school_learning_items from public, anon, authenticated;
grant select, delete on table public.school_learning_items to authenticated;
grant insert (tenant_id, author_id, class_name, kind, title, body, starts_at, due_at, published)
  on public.school_learning_items to authenticated;
grant update (class_name, kind, title, body, starts_at, due_at, published)
  on public.school_learning_items to authenticated;
grant all on table public.school_learning_items to service_role;

drop policy if exists "Active teachers read their own student roster"
  on public.students;
create policy "Active teachers read their own student roster"
  on public.students
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in (
      'admin_sekolah', 'operator', 'guru', 'guru_bk',
      'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = students.tenant_id
        and tenant.active = true
    )
  );

drop policy if exists "Active school staff read learning items"
  on public.school_learning_items;
create policy "Active school staff read learning items"
  on public.school_learning_items
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in (
      'admin_sekolah', 'operator', 'guru', 'guru_bk',
      'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
    and (
      published
      or author_id = (select auth.uid())
      or (select public.current_app_role()) in ('admin_sekolah', 'operator')
    )
    and exists (
      select 1 from public.tenants as tenant
      where tenant.id = school_learning_items.tenant_id
        and tenant.active = true
    )
  );

drop policy if exists "Active school staff create learning items"
  on public.school_learning_items;
create policy "Active school staff create learning items"
  on public.school_learning_items
  for insert
  to authenticated
  with check (
    (select public.current_user_is_active())
    and tenant_id = (select public.current_tenant_id())
    and author_id = (select auth.uid())
    and (select public.current_app_role()) in (
      'admin_sekolah', 'operator', 'guru', 'guru_bk',
      'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
    and (
      (select public.current_app_role()) in ('admin_sekolah', 'operator')
      or exists (
        select 1
        from public.students as student
        where student.owner_id = (select auth.uid())
          and student.tenant_id = school_learning_items.tenant_id
          and student.kelas = school_learning_items.class_name
      )
    )
    and exists (
      select 1 from public.tenants as tenant
      where tenant.id = school_learning_items.tenant_id
        and tenant.active = true
    )
  );

drop policy if exists "Active school staff update learning items"
  on public.school_learning_items;
create policy "Active school staff update learning items"
  on public.school_learning_items
  for update
  to authenticated
  using (
    (select public.current_user_is_active())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in (
      'admin_sekolah', 'operator', 'guru', 'guru_bk',
      'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
    and (
      author_id = (select auth.uid())
      or (select public.current_app_role()) in ('admin_sekolah', 'operator')
    )
    and exists (
      select 1 from public.tenants as tenant
      where tenant.id = school_learning_items.tenant_id
        and tenant.active = true
    )
  )
  with check (
    (select public.current_user_is_active())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in (
      'admin_sekolah', 'operator', 'guru', 'guru_bk',
      'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
    and (
      author_id = (select auth.uid())
      or (select public.current_app_role()) in ('admin_sekolah', 'operator')
    )
    and (
      (select public.current_app_role()) in ('admin_sekolah', 'operator')
      or exists (
        select 1
        from public.students as student
        where student.owner_id = (select auth.uid())
          and student.tenant_id = school_learning_items.tenant_id
          and student.kelas = school_learning_items.class_name
      )
    )
  );

drop policy if exists "Active school staff delete learning items"
  on public.school_learning_items;
create policy "Active school staff delete learning items"
  on public.school_learning_items
  for delete
  to authenticated
  using (
    (select public.current_user_is_active())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in (
      'admin_sekolah', 'operator', 'guru', 'guru_bk',
      'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
    and (
      author_id = (select auth.uid())
      or (select public.current_app_role()) in ('admin_sekolah', 'operator')
    )
    and exists (
      select 1 from public.tenants as tenant
      where tenant.id = school_learning_items.tenant_id
        and tenant.active = true
    )
  );

create or replace function public.student_learning_feed()
returns table (
  id uuid,
  class_name text,
  kind text,
  title text,
  body text,
  starts_at timestamptz,
  due_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'siswa'
  then
    raise exception 'Feed belajar hanya tersedia bagi akun siswa aktif.'
      using errcode = '42501';
  end if;

  return query
  select distinct item.id, item.class_name, item.kind, item.title, item.body,
    item.starts_at, item.due_at, item.created_at
  from public.school_learning_items as item
  join public.tenants as tenant
    on tenant.id = item.tenant_id and tenant.active = true
  join public.student_account_links as link
    on link.user_id = auth.uid() and link.tenant_id = item.tenant_id
  join public.students as student
    on student.id = link.student_id
    and student.tenant_id = link.tenant_id
    and student.kelas = item.class_name
  where item.tenant_id = (select public.current_tenant_id())
    and item.published = true
  order by item.starts_at nulls last, item.created_at desc, item.id
  limit 300;
end;
$$;

revoke all on function public.student_learning_feed() from public, anon;
grant execute on function public.student_learning_feed() to authenticated;
