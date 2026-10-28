create table if not exists public.user_integration_consents (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  consent_version text not null check (consent_version = '2026-10-25'),
  selected_services text[] not null default '{}',
  completed_at timestamptz not null default now(),
  check (selected_services <@ array['drive', 'sheets', 'meet', 'calendar', 'tasks']::text[])
);

alter table public.user_integration_consents enable row level security;
revoke all on table public.user_integration_consents from public, anon, authenticated;
grant select on table public.user_integration_consents to authenticated;
grant all on table public.user_integration_consents to service_role;

drop policy if exists "Users read their own integration consent"
  on public.user_integration_consents;
create policy "Users read their own integration consent"
  on public.user_integration_consents
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and user_id = (select auth.uid())
  );

create or replace function public.save_user_integration_consent(
  p_selected_services text[],
  p_consent_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  prior_value jsonb;
  next_services text[];
begin
  if actor_id is null or not public.current_user_is_active() then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  if p_consent_version <> '2026-10-25'
    or p_selected_services is null
    or cardinality(p_selected_services) > 5
    or exists (
      select 1
      from unnest(p_selected_services) as requested(service)
      where requested.service is null
        or requested.service not in ('drive', 'sheets', 'meet', 'calendar', 'tasks')
    )
    or cardinality(p_selected_services) <> (
      select count(distinct requested.service)
      from unnest(p_selected_services) as requested(service)
    ) then
    raise exception using errcode = '22023', message = 'invalid-integration-consent';
  end if;

  select coalesce(array_agg(service order by service), '{}'::text[])
  into next_services
  from (
    select distinct requested.service
    from unnest(p_selected_services) as requested(service)
  ) as services;

  select jsonb_build_object(
    'version', consent_version,
    'services', selected_services
  )
  into prior_value
  from public.user_integration_consents
  where user_id = actor_id;

  insert into public.user_integration_consents (
    user_id, consent_version, selected_services, completed_at
  )
  values (actor_id, p_consent_version, next_services, now())
  on conflict (user_id) do update
    set consent_version = excluded.consent_version,
        selected_services = excluded.selected_services,
        completed_at = excluded.completed_at;

  insert into public.platform_audit (
    actor_id, action, target, before_value, after_value
  )
  values (
    actor_id,
    'user.integration_consent.saved',
    actor_id::text,
    prior_value,
    jsonb_build_object('version', p_consent_version, 'services', next_services)
  );

  return jsonb_build_object(
    'userId', actor_id,
    'version', p_consent_version,
    'services', next_services
  );
end;
$$;

revoke all on function public.save_user_integration_consent(text[], text)
  from public, anon;
grant execute on function public.save_user_integration_consent(text[], text)
  to authenticated;
