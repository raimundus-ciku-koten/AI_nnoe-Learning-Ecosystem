create table if not exists public.school_access_index (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete restrict,
  principal_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid references auth.users(id) on delete cascade,
  scope_kind text not null check (scope_kind in ('tenant', 'class', 'student')),
  scope_id text,
  access_level text not null check (access_level in ('read', 'write', 'manage')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    (scope_kind = 'tenant' and scope_id is null and subject_id is null)
    or (scope_kind = 'class' and scope_id is not null and subject_id is null)
    or (scope_kind = 'student' and scope_id is null and subject_id is not null)
  ),
  check (scope_id is null or char_length(scope_id) between 1 and 160),
  unique nulls not distinct (tenant_id, principal_id, subject_id, scope_kind, scope_id)
);

create table if not exists public.user_encryption_keys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  public_key text not null check (char_length(public_key) between 64 and 4096),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  key_version smallint not null check (key_version > 0),
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

create table if not exists public.drive_file_index (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  tenant_id text not null references public.tenants(id) on delete restrict,
  drive_file_id text not null check (char_length(drive_file_id) between 1 and 256),
  category text not null check (
    category in ('profile', 'planning', 'attendance', 'assessment', 'communication', 'export', 'other')
  ),
  ciphertext_sha256 text not null check (ciphertext_sha256 ~ '^[a-f0-9]{64}$'),
  ciphertext_size_bytes bigint not null check (ciphertext_size_bytes between 1 and 10489856),
  encryption_version smallint not null check (encryption_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (owner_id, drive_file_id)
);

create table if not exists public.drive_file_access (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.drive_file_index(id) on delete cascade,
  grantee_id uuid not null references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  access_level text not null check (access_level in ('read', 'write')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (file_id, grantee_id),
  check (granted_by is null or granted_by <> grantee_id)
);

create table if not exists public.drive_file_key_envelopes (
  file_id uuid not null references public.drive_file_index(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  wrapped_data_key text not null check (char_length(wrapped_data_key) between 64 and 4096),
  recipient_key_fingerprint text not null check (recipient_key_fingerprint ~ '^[a-f0-9]{64}$'),
  key_version smallint not null check (key_version > 0),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (file_id, recipient_id)
);

create table if not exists public.security_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id text references public.tenants(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) between 1 and 120),
  resource_type text not null check (char_length(resource_type) between 1 and 80),
  resource_id text check (resource_id is null or char_length(resource_id) <= 160),
  created_at timestamptz not null default now()
);

create table if not exists public.tenant_entitlements (
  tenant_id text primary key references public.tenants(id) on delete restrict,
  plan_id text not null check (char_length(plan_id) between 1 and 80),
  status text not null check (status in ('trial', 'active', 'past_due', 'suspended', 'cancelled')),
  valid_until timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists school_access_index_principal_idx
  on public.school_access_index (principal_id, tenant_id);
create index if not exists school_access_index_subject_idx
  on public.school_access_index (subject_id, tenant_id)
  where subject_id is not null;
create index if not exists drive_file_index_owner_idx
  on public.drive_file_index (owner_id, updated_at desc)
  where revoked_at is null;
create index if not exists drive_file_access_grantee_idx
  on public.drive_file_access (grantee_id, file_id)
  where revoked_at is null;
create index if not exists drive_file_key_envelopes_recipient_idx
  on public.drive_file_key_envelopes (recipient_id, file_id)
  where revoked_at is null;
create index if not exists security_audit_tenant_created_idx
  on public.security_audit (tenant_id, created_at desc);

create or replace function public.user_can_read_drive_file(p_file_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select public.current_user_is_active())
    and exists (
      select 1
      from public.drive_file_access as access
      join public.drive_file_index as file_index
        on file_index.id = access.file_id
      where access.file_id = p_file_id
        and access.grantee_id = (select auth.uid())
        and access.revoked_at is null
        and file_index.revoked_at is null
    )
$$;

create or replace function public.user_owns_active_drive_file(p_file_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select public.current_user_is_active())
    and exists (
      select 1
      from public.drive_file_index as file_index
      where file_index.id = p_file_id
        and file_index.owner_id = (select auth.uid())
        and file_index.revoked_at is null
    )
$$;

revoke all on function public.user_can_read_drive_file(uuid)
  from public, anon;
revoke all on function public.user_owns_active_drive_file(uuid)
  from public, anon;
grant execute on function public.user_can_read_drive_file(uuid)
  to authenticated;
grant execute on function public.user_owns_active_drive_file(uuid)
  to authenticated;

alter table public.school_access_index enable row level security;
alter table public.user_encryption_keys enable row level security;
alter table public.drive_file_index enable row level security;
alter table public.drive_file_access enable row level security;
alter table public.drive_file_key_envelopes enable row level security;
alter table public.security_audit enable row level security;
alter table public.tenant_entitlements enable row level security;

revoke all on table
  public.school_access_index,
  public.user_encryption_keys,
  public.drive_file_index,
  public.drive_file_access,
  public.drive_file_key_envelopes,
  public.security_audit,
  public.tenant_entitlements
from anon, authenticated;

grant select on table
  public.school_access_index,
  public.user_encryption_keys,
  public.drive_file_index,
  public.drive_file_access,
  public.drive_file_key_envelopes,
  public.security_audit,
  public.tenant_entitlements
to authenticated;

grant all on table
  public.school_access_index,
  public.user_encryption_keys,
  public.drive_file_index,
  public.drive_file_access,
  public.drive_file_key_envelopes,
  public.security_audit,
  public.tenant_entitlements
to service_role;

drop policy if exists "Active users read their access index"
  on public.school_access_index;
create policy "Active users read their access index"
  on public.school_access_index
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and (
      principal_id = (select auth.uid())
      or subject_id = (select auth.uid())
      or (select public.current_app_role()) = 'superadmin'
      or (
        (select public.current_app_role()) = 'admin_sekolah'
        and tenant_id = (select public.current_tenant_id())
      )
    )
  );

drop policy if exists "Active users read their own public encryption key"
  on public.user_encryption_keys;
create policy "Active users read their own public encryption key"
  on public.user_encryption_keys
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and user_id = (select auth.uid())
  );

drop policy if exists "Active users read owned or shared Drive file indexes"
  on public.drive_file_index;
create policy "Active users read owned or shared Drive file indexes"
  on public.drive_file_index
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and revoked_at is null
    and (
      owner_id = (select auth.uid())
      or (select public.user_can_read_drive_file(id))
    )
  );

drop policy if exists "Active users read their Drive file access"
  on public.drive_file_access;
create policy "Active users read their Drive file access"
  on public.drive_file_access
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and revoked_at is null
    and (
      (
        grantee_id = (select auth.uid())
        and (select public.user_can_read_drive_file(file_id))
      )
      or (select public.user_owns_active_drive_file(file_id))
    )
  );

drop policy if exists "Active recipients read their encrypted key envelopes"
  on public.drive_file_key_envelopes;
create policy "Active recipients read their encrypted key envelopes"
  on public.drive_file_key_envelopes
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and revoked_at is null
    and (
      (
        recipient_id = (select auth.uid())
        and (select public.user_can_read_drive_file(file_id))
      )
      or (select public.user_owns_active_drive_file(file_id))
    )
  );

drop policy if exists "Active users read their security audit entries"
  on public.security_audit;
create policy "Active users read their security audit entries"
  on public.security_audit
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and (
      actor_id = (select auth.uid())
      or (select public.current_app_role()) = 'superadmin'
      or (
        (select public.current_app_role()) = 'admin_sekolah'
        and tenant_id = (select public.current_tenant_id())
      )
    )
  );

drop policy if exists "Active tenant members read their entitlements"
  on public.tenant_entitlements;
create policy "Active tenant members read their entitlements"
  on public.tenant_entitlements
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and (
      tenant_id = (select public.current_tenant_id())
      or (select public.current_app_role()) = 'superadmin'
    )
  );
