create table if not exists public.private_workspace_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tenant_id text references public.tenants(id) on delete restrict,
  role text not null check (
    role in (
      'superadmin',
      'admin',
      'admin_sekolah',
      'operator',
      'guru',
      'guru_bk',
      'guru_kokurikuler',
      'guru_ekstrakurikuler',
      'siswa',
      'ortu',
      'orang_tua',
      'kepala_sekolah',
      'wali_kelas'
    )
  ),
  route text not null check (
    char_length(route) between 2 and 160
    and route ~ '^(/[a-z0-9-]+)+$'
  ),
  search text not null default '' check (
    search = ''
    or search ~ '^\?[a-zA-Z0-9_%-]+=[a-zA-Z0-9_%-]+(&[a-zA-Z0-9_%-]+=[a-zA-Z0-9_%-]+)*$'
  ),
  title text not null check (
    char_length(title) between 1 and 120
    and title = btrim(title)
    and title !~ '[[:cntrl:]]'
  ),
  details text not null default '' check (
    char_length(details) <= 6000
  ),
  status text not null default 'planned'
    check (status in ('planned', 'in_progress', 'done')),
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (role = 'superadmin' and tenant_id is null)
    or (role <> 'superadmin' and tenant_id is not null)
  )
);

create index if not exists private_workspace_records_owner_route_updated_idx
  on public.private_workspace_records (user_id, role, route, search, updated_at desc);

drop trigger if exists private_workspace_records_set_updated_at
  on public.private_workspace_records;
create trigger private_workspace_records_set_updated_at
  before update on public.private_workspace_records
  for each row execute function public.set_updated_at();

alter table public.private_workspace_records enable row level security;
revoke all on table public.private_workspace_records
  from public, anon, authenticated;
grant select, insert, update, delete on table public.private_workspace_records
  to authenticated;
grant all on table public.private_workspace_records to service_role;

drop policy if exists "Users manage their own private workspace records"
  on public.private_workspace_records;
create policy "Users manage their own private workspace records"
  on public.private_workspace_records
  for all
  to authenticated
  using (
    (select public.current_user_is_active())
    and user_id = (select auth.uid())
    and role = (select public.current_app_role())
    and tenant_id is not distinct from nullif((select public.current_tenant_id()), '')
  )
  with check (
    (select public.current_user_is_active())
    and user_id = (select auth.uid())
    and role = (select public.current_app_role())
    and tenant_id is not distinct from nullif((select public.current_tenant_id()), '')
  );
