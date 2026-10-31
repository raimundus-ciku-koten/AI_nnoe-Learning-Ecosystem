create table if not exists public.school_module_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete restrict,
  module_key text not null check (
    module_key ~ '^/admin/[a-z0-9/-]+$'
    and char_length(module_key) between 7 and 120
  ),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  title text not null check (
    char_length(title) between 1 and 200
    and title = btrim(title)
  ),
  description text not null default '' check (char_length(description) <= 2000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'done')),
  due_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists school_module_actions_tenant_module_updated_idx
  on public.school_module_actions (tenant_id, module_key, updated_at desc, id desc);

drop trigger if exists school_module_actions_set_updated_at on public.school_module_actions;
create trigger school_module_actions_set_updated_at
  before update on public.school_module_actions
  for each row execute function public.set_updated_at();

alter table public.school_module_actions enable row level security;
revoke all on table public.school_module_actions from public, anon, authenticated;
grant all on table public.school_module_actions to service_role;

create or replace function public.school_module_actions_list(p_module_key text)
returns table (
  id uuid,
  module_key text,
  title text,
  description text,
  status text,
  due_date date,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_tenant_id text := public.current_tenant_id();
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'admin_sekolah'
    or actor_tenant_id = '' then
    raise exception 'Admin sekolah aktif diperlukan untuk melihat tindak lanjut.'
      using errcode = '42501';
  end if;

  if p_module_key is null
    or p_module_key !~ '^/admin/[a-z0-9/-]+$'
    or char_length(p_module_key) not between 7 and 120 then
    raise exception 'Konteks submenu tidak valid.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.tenants as tenant
    where tenant.id = actor_tenant_id and tenant.active = true
  ) then
    raise exception 'Tenant sekolah tidak aktif.' using errcode = '42501';
  end if;

  return query
  select action.id, action.module_key, action.title, action.description,
    action.status, action.due_date, action.created_by, action.created_at, action.updated_at
  from public.school_module_actions as action
  where action.tenant_id = actor_tenant_id
    and action.module_key = p_module_key
  order by action.updated_at desc, action.id desc
  limit 200;
end;
$$;

create or replace function public.school_module_action_save(
  p_id uuid,
  p_module_key text,
  p_title text,
  p_description text,
  p_status text,
  p_due_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_tenant_id text := public.current_tenant_id();
  normalized_title text := btrim(coalesce(p_title, ''));
  normalized_description text := btrim(coalesce(p_description, ''));
  saved_id uuid;
  audit_action text;
begin
  if actor_id is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'admin_sekolah'
    or actor_tenant_id = '' then
    raise exception 'Admin sekolah aktif diperlukan untuk menyimpan tindak lanjut.'
      using errcode = '42501';
  end if;

  if p_module_key is null
    or p_module_key !~ '^/admin/[a-z0-9/-]+$'
    or char_length(p_module_key) not between 7 and 120
    or char_length(normalized_title) not between 1 and 200
    or normalized_title ~ '[[:cntrl:]]'
    or char_length(normalized_description) > 2000
    or p_status not in ('open', 'in_progress', 'done') then
    raise exception 'Data tindak lanjut tidak valid.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.tenants as tenant
    where tenant.id = actor_tenant_id and tenant.active = true
  ) then
    raise exception 'Tenant sekolah tidak aktif.' using errcode = '42501';
  end if;

  if p_id is null then
    insert into public.school_module_actions (
      tenant_id, module_key, created_by, updated_by, title, description,
      status, due_date, completed_at
    ) values (
      actor_tenant_id, p_module_key, actor_id, actor_id, normalized_title,
      normalized_description, p_status, p_due_date,
      case when p_status = 'done' then now() else null end
    ) returning id into saved_id;
    audit_action := 'school.module_action.created';
  else
    update public.school_module_actions as action
    set updated_by = actor_id,
        title = normalized_title,
        description = normalized_description,
        status = p_status,
        due_date = p_due_date,
        completed_at = case when p_status = 'done' then coalesce(action.completed_at, now()) else null end
    where action.id = p_id
      and action.tenant_id = actor_tenant_id
      and action.module_key = p_module_key
    returning action.id into saved_id;
    if not found then
      raise exception 'Tindak lanjut tidak ditemukan pada submenu ini.' using errcode = '42501';
    end if;
    audit_action := 'school.module_action.updated';
  end if;

  insert into public.security_audit (
    tenant_id, actor_id, action, resource_type, resource_id
  ) values (
    actor_tenant_id, actor_id, audit_action, 'school_module_action', saved_id::text
  );

  return saved_id;
end;
$$;

create or replace function public.school_module_action_delete(p_id uuid, p_module_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_tenant_id text := public.current_tenant_id();
  deleted_id uuid;
begin
  if actor_id is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'admin_sekolah'
    or actor_tenant_id = '' then
    raise exception 'Admin sekolah aktif diperlukan untuk menghapus tindak lanjut.'
      using errcode = '42501';
  end if;

  if p_id is null
    or p_module_key is null
    or p_module_key !~ '^/admin/[a-z0-9/-]+$'
    or char_length(p_module_key) not between 7 and 120 then
    raise exception 'Tindak lanjut tidak valid.' using errcode = '22023';
  end if;

  delete from public.school_module_actions as action
  where action.id = p_id
    and action.tenant_id = actor_tenant_id
    and action.module_key = p_module_key
  returning action.id into deleted_id;

  if deleted_id is null then
    raise exception 'Tindak lanjut tidak ditemukan pada submenu ini.' using errcode = '42501';
  end if;

  insert into public.security_audit (
    tenant_id, actor_id, action, resource_type, resource_id
  ) values (
    actor_tenant_id, actor_id, 'school.module_action.deleted',
    'school_module_action', deleted_id::text
  );

  return true;
end;
$$;

revoke all on function public.school_module_actions_list(text) from public, anon;
revoke all on function public.school_module_action_save(uuid, text, text, text, text, date)
  from public, anon;
revoke all on function public.school_module_action_delete(uuid, text) from public, anon;
grant execute on function public.school_module_actions_list(text) to authenticated;
grant execute on function public.school_module_action_save(uuid, text, text, text, text, date)
  to authenticated;
grant execute on function public.school_module_action_delete(uuid, text) to authenticated;