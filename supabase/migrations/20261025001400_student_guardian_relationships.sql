-- School-verified student/guardian relationships.
-- This migration does not grant guardians access to student or academic records.

create unique index if not exists students_id_tenant_unique
  on public.students (id, tenant_id);

create unique index if not exists profiles_id_tenant_unique
  on public.profiles (id, tenant_id);

create table if not exists public.student_guardian_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete restrict,
  student_id uuid not null,
  guardian_user_id uuid not null,
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'rejected', 'revoked')),
  created_by uuid not null,
  last_action_by uuid,
  verified_by uuid,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, guardian_user_id),
  foreign key (student_id, tenant_id)
    references public.students(id, tenant_id) on delete cascade,
  foreign key (guardian_user_id, tenant_id)
    references public.profiles(id, tenant_id) on delete cascade,
  foreign key (created_by, tenant_id)
    references public.profiles(id, tenant_id) on delete restrict,
  foreign key (last_action_by, tenant_id)
    references public.profiles(id, tenant_id) on delete restrict,
  foreign key (verified_by, tenant_id)
    references public.profiles(id, tenant_id) on delete restrict,
  check (
    (status = 'verified' and verified_by is not null and verified_at is not null)
    or (status <> 'verified' and verified_at is null)
  )
);

create table if not exists public.student_guardian_link_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete restrict,
  link_id uuid not null,
  student_id uuid not null,
  guardian_user_id uuid not null,
  actor_id uuid,
  action text not null check (action in ('request', 'verify', 'reject', 'revoke')),
  previous_status text check (
    previous_status is null or previous_status in ('pending', 'verified', 'rejected', 'revoked')
  ),
  new_status text not null
    check (new_status in ('pending', 'verified', 'rejected', 'revoked')),
  created_at timestamptz not null default now(),
  foreign key (actor_id, tenant_id)
    references public.profiles(id, tenant_id) on delete restrict
);

create index if not exists student_guardian_links_tenant_student_idx
  on public.student_guardian_links (tenant_id, student_id, status);
create index if not exists student_guardian_links_guardian_idx
  on public.student_guardian_links (tenant_id, guardian_user_id, status);
create index if not exists student_guardian_link_audit_tenant_created_idx
  on public.student_guardian_link_audit (tenant_id, created_at desc, id);

drop trigger if exists student_guardian_links_set_updated_at
  on public.student_guardian_links;
create trigger student_guardian_links_set_updated_at
  before update on public.student_guardian_links
  for each row execute function public.set_updated_at();

alter table public.student_guardian_links enable row level security;
alter table public.student_guardian_link_audit enable row level security;
revoke all on table public.student_guardian_links
  from public, anon, authenticated;
revoke all on table public.student_guardian_link_audit
  from public, anon, authenticated;
grant select on table public.student_guardian_links to authenticated;
grant select on table public.student_guardian_link_audit to authenticated;
grant all on table public.student_guardian_links to service_role;
grant all on table public.student_guardian_link_audit to service_role;

drop policy if exists "School admins read same-tenant guardian links"
  on public.student_guardian_links;
create policy "School admins read same-tenant guardian links"
  on public.student_guardian_links
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and (select public.current_app_role()) in ('admin', 'admin_sekolah')
    and tenant_id = (select public.current_tenant_id())
    and exists (
      select 1 from public.tenants as tenant
      where tenant.id = student_guardian_links.tenant_id
        and tenant.active = true
    )
  );

drop policy if exists "Guardians read only their verified same-tenant links"
  on public.student_guardian_links;
create policy "Guardians read only their verified same-tenant links"
  on public.student_guardian_links
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and (select public.current_app_role()) in ('ortu', 'orang_tua')
    and guardian_user_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and status = 'verified'
    and exists (
      select 1 from public.tenants as tenant
      where tenant.id = student_guardian_links.tenant_id
        and tenant.active = true
    )
  );

drop policy if exists "School admins read same-tenant guardian link audit"
  on public.student_guardian_link_audit;
create policy "School admins read same-tenant guardian link audit"
  on public.student_guardian_link_audit
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and (select public.current_app_role()) in ('admin', 'admin_sekolah')
    and tenant_id = (select public.current_tenant_id())
    and exists (
      select 1 from public.tenants as tenant
      where tenant.id = student_guardian_link_audit.tenant_id
        and tenant.active = true
    )
  );

create or replace function public.manage_student_guardian_link(
  p_student_id uuid,
  p_guardian_user_id uuid,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_tenant text := public.current_tenant_id();
  current_link public.student_guardian_links%rowtype;
  previous_status text;
  inserted_count integer;
begin
  if auth.uid() is null
    or not public.current_user_is_active()
    or public.current_app_role() not in ('admin', 'admin_sekolah')
    or p_action not in ('request', 'verify', 'reject', 'revoke') then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  if not exists (
    select 1
    from public.tenants as tenant
    where tenant.id = actor_tenant
      and tenant.active = true
  ) or not exists (
    select 1
    from public.students as student
    where student.id = p_student_id
      and student.tenant_id = actor_tenant
  ) or not exists (
    select 1
    from public.profiles as guardian
    where guardian.id = p_guardian_user_id
      and guardian.tenant_id = actor_tenant
      and guardian.active = true
      and (
        guardian.role in ('ortu', 'orang_tua')
        or guardian.roles && array['ortu', 'orang_tua']::text[]
      )
  ) then
    raise exception using errcode = '42501', message = 'tenant-or-guardian-forbidden';
  end if;

  if p_action = 'request' then
    insert into public.student_guardian_links (
      tenant_id, student_id, guardian_user_id, status, created_by
    )
    values (actor_tenant, p_student_id, p_guardian_user_id, 'pending', auth.uid())
    on conflict (student_id, guardian_user_id) do nothing;
    get diagnostics inserted_count = row_count;

    select * into current_link
    from public.student_guardian_links
    where student_id = p_student_id
      and guardian_user_id = p_guardian_user_id
      and tenant_id = actor_tenant
    for update;

    previous_status := current_link.status;
    if current_link.status = 'rejected' or current_link.status = 'revoked' then
      update public.student_guardian_links
      set status = 'pending',
        last_action_by = auth.uid(),
        verified_by = null,
        verified_at = null
      where id = current_link.id;
      insert into public.student_guardian_link_audit (
        tenant_id, link_id, student_id, guardian_user_id, actor_id,
        action, previous_status, new_status
      ) values (
        actor_tenant, current_link.id, p_student_id, p_guardian_user_id,
        auth.uid(), p_action, previous_status, 'pending'
      );
    elsif current_link.status <> 'pending' then
      raise exception using errcode = '22023', message = 'invalid-link-transition';
    elsif inserted_count = 1 then
      insert into public.student_guardian_link_audit (
        tenant_id, link_id, student_id, guardian_user_id, actor_id,
        action, previous_status, new_status
      ) values (
        actor_tenant, current_link.id, p_student_id, p_guardian_user_id,
        auth.uid(), p_action, null, 'pending'
      );
    end if;
    return;
  end if;

  select * into current_link
  from public.student_guardian_links
  where student_id = p_student_id
    and guardian_user_id = p_guardian_user_id
    and tenant_id = actor_tenant
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'guardian-link-not-found';
  end if;
  previous_status := current_link.status;

  if p_action = 'verify' and current_link.status = 'pending' then
    update public.student_guardian_links
    set status = 'verified',
      last_action_by = auth.uid(),
      verified_by = auth.uid(),
      verified_at = now()
    where id = current_link.id;
    insert into public.student_guardian_link_audit (
      tenant_id, link_id, student_id, guardian_user_id, actor_id,
      action, previous_status, new_status
    ) values (
      actor_tenant, current_link.id, p_student_id, p_guardian_user_id,
      auth.uid(), p_action, previous_status, 'verified'
    );
  elsif p_action = 'reject' and current_link.status = 'pending' then
    update public.student_guardian_links
    set status = 'rejected',
      last_action_by = auth.uid(),
      verified_by = null,
      verified_at = null
    where id = current_link.id;
    insert into public.student_guardian_link_audit (
      tenant_id, link_id, student_id, guardian_user_id, actor_id,
      action, previous_status, new_status
    ) values (
      actor_tenant, current_link.id, p_student_id, p_guardian_user_id,
      auth.uid(), p_action, previous_status, 'rejected'
    );
  elsif p_action = 'revoke' and current_link.status = 'verified' then
    update public.student_guardian_links
    set status = 'revoked',
      last_action_by = auth.uid(),
      verified_by = null,
      verified_at = null
    where id = current_link.id;
    insert into public.student_guardian_link_audit (
      tenant_id, link_id, student_id, guardian_user_id, actor_id,
      action, previous_status, new_status
    ) values (
      actor_tenant, current_link.id, p_student_id, p_guardian_user_id,
      auth.uid(), p_action, previous_status, 'revoked'
    );
  else
    raise exception using errcode = '22023', message = 'invalid-link-transition';
  end if;
end;
$$;

revoke all on function public.manage_student_guardian_link(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.manage_student_guardian_link(uuid, uuid, text)
  to authenticated;
