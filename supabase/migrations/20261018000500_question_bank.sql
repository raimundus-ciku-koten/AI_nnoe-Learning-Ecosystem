create or replace function public.question_bank_choices_valid(
  p_kind text,
  p_choices text[],
  p_answer text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_kind = 'uraian' then cardinality(p_choices) = 0
    when p_kind = 'pilihan_ganda' then
      cardinality(p_choices) between 2 and 5
      and array_position(p_choices, null) is null
      and not exists (
        select 1
        from unnest(p_choices) as choice
        where char_length(choice) not between 1 and 300
      )
      and (
        select count(distinct choice) = cardinality(p_choices)
        from unnest(p_choices) as choices(choice)
      )
      and p_answer = any (p_choices)
    else false
  end
$$;

revoke all on function public.question_bank_choices_valid(text, text[], text)
  from public, anon;
grant execute on function public.question_bank_choices_valid(text, text[], text)
  to authenticated, service_role;

create table if not exists public.question_bank (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete cascade,
  mapel text not null check (
    char_length(mapel) between 1 and 80
    and mapel = btrim(mapel)
  ),
  kelas text not null check (
    char_length(kelas) between 1 and 30
    and kelas = btrim(kelas)
  ),
  jenis text not null check (jenis in ('pilihan_ganda', 'uraian')),
  pertanyaan text not null check (char_length(pertanyaan) between 1 and 2000),
  pilihan text[] not null default '{}',
  jawaban text not null check (char_length(jawaban) between 1 and 1000),
  pembahasan text not null default '' check (char_length(pembahasan) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (public.question_bank_choices_valid(jenis, pilihan, jawaban))
);

create index if not exists question_bank_tenant_updated_idx
  on public.question_bank (tenant_id, updated_at desc, id desc);
create index if not exists question_bank_owner_updated_idx
  on public.question_bank (owner_id, updated_at desc, id desc);

drop trigger if exists question_bank_set_updated_at on public.question_bank;
create trigger question_bank_set_updated_at
  before update on public.question_bank
  for each row execute function public.set_updated_at();

alter table public.question_bank enable row level security;

revoke all on table public.question_bank from public, anon, authenticated;
grant select, delete on table public.question_bank to authenticated;
grant insert (
  tenant_id, owner_id, mapel, kelas, jenis, pertanyaan, pilihan, jawaban, pembahasan
) on table public.question_bank to authenticated;
grant update (
  mapel, kelas, jenis, pertanyaan, pilihan, jawaban, pembahasan
) on table public.question_bank to authenticated;
grant all on table public.question_bank to service_role;

drop policy if exists "Active school staff read tenant question bank"
  on public.question_bank;
create policy "Active school staff read tenant question bank"
  on public.question_bank
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and (
      (select public.current_app_role()) = 'superadmin'
      or (
        tenant_id = (select public.current_tenant_id())
        and (select public.current_app_role()) in ('admin_sekolah', 'guru')
        and exists (
          select 1
          from public.tenants as tenant
          where tenant.id = question_bank.tenant_id
            and tenant.active = true
        )
      )
    )
  );

drop policy if exists "Entitled teachers create their own tenant questions"
  on public.question_bank;
create policy "Entitled teachers create their own tenant questions"
  on public.question_bank
  for insert
  to authenticated
  with check (
    (select public.current_user_is_active())
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) = 'guru'
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = question_bank.tenant_id
        and tenant.active = true
    )
    and (
      exists (
        select 1
        from public.tenant_entitlements as entitlement
        where entitlement.tenant_id = question_bank.tenant_id
          and entitlement.status in ('trial', 'active')
          and (entitlement.valid_until is null or entitlement.valid_until > now())
      )
      or exists (
        select 1
        from public.personal_entitlements as entitlement
        join public.billing_plans as plan on plan.id = entitlement.plan_id
        where entitlement.user_id = (select auth.uid())
          and entitlement.status in ('trial', 'active')
          and (entitlement.valid_until is null or entitlement.valid_until > now())
          and plan.allowed_role = 'guru'
          and plan.active = true
      )
    )
  );

drop policy if exists "Entitled teachers update their own tenant questions"
  on public.question_bank;
create policy "Entitled teachers update their own tenant questions"
  on public.question_bank
  for update
  to authenticated
  using (
    (select public.current_user_is_active())
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) = 'guru'
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = question_bank.tenant_id
        and tenant.active = true
    )
    and (
      exists (
        select 1
        from public.tenant_entitlements as entitlement
        where entitlement.tenant_id = question_bank.tenant_id
          and entitlement.status in ('trial', 'active')
          and (entitlement.valid_until is null or entitlement.valid_until > now())
      )
      or exists (
        select 1
        from public.personal_entitlements as entitlement
        join public.billing_plans as plan on plan.id = entitlement.plan_id
        where entitlement.user_id = (select auth.uid())
          and entitlement.status in ('trial', 'active')
          and (entitlement.valid_until is null or entitlement.valid_until > now())
          and plan.allowed_role = 'guru'
          and plan.active = true
      )
    )
  )
  with check (
    (select public.current_user_is_active())
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) = 'guru'
  );

drop policy if exists "Entitled teachers delete their own tenant questions"
  on public.question_bank;
create policy "Entitled teachers delete their own tenant questions"
  on public.question_bank
  for delete
  to authenticated
  using (
    (select public.current_user_is_active())
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) = 'guru'
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = question_bank.tenant_id
        and tenant.active = true
    )
    and (
      exists (
        select 1
        from public.tenant_entitlements as entitlement
        where entitlement.tenant_id = question_bank.tenant_id
          and entitlement.status in ('trial', 'active')
          and (entitlement.valid_until is null or entitlement.valid_until > now())
      )
      or exists (
        select 1
        from public.personal_entitlements as entitlement
        join public.billing_plans as plan on plan.id = entitlement.plan_id
        where entitlement.user_id = (select auth.uid())
          and entitlement.status in ('trial', 'active')
          and (entitlement.valid_until is null or entitlement.valid_until > now())
          and plan.allowed_role = 'guru'
          and plan.active = true
      )
    )
  );
