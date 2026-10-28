create table if not exists public.platform_control (
  id text primary key check (id = 'global'),
  maintenance boolean not null default false,
  features jsonb not null default '{"aiAssistant":false,"aiGeneration":false}'::jsonb
    check (
      jsonb_typeof(features) = 'object'
      and features ?& array['aiAssistant', 'aiGeneration']
      and features = jsonb_build_object(
        'aiAssistant', features -> 'aiAssistant',
        'aiGeneration', features -> 'aiGeneration'
      )
      and jsonb_typeof(features -> 'aiAssistant') = 'boolean'
      and jsonb_typeof(features -> 'aiGeneration') = 'boolean'
    ),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_public_config (
  id text primary key check (id = 'platform'),
  maintenance boolean not null default false,
  features jsonb not null default '{"aiAssistant":false,"aiGeneration":false}'::jsonb
    check (
      jsonb_typeof(features) = 'object'
      and features ?& array['aiAssistant', 'aiGeneration']
      and features = jsonb_build_object(
        'aiAssistant', features -> 'aiAssistant',
        'aiGeneration', features -> 'aiGeneration'
      )
      and jsonb_typeof(features -> 'aiAssistant') = 'boolean'
      and jsonb_typeof(features -> 'aiGeneration') = 'boolean'
    ),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) between 1 and 120),
  target text not null check (char_length(target) between 1 and 160),
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz not null default now()
);

insert into public.platform_control (id)
values ('global')
on conflict (id) do nothing;

insert into public.platform_public_config (id)
values ('platform')
on conflict (id) do nothing;

alter table public.platform_control enable row level security;
alter table public.platform_public_config enable row level security;
alter table public.platform_audit enable row level security;

revoke all on table public.platform_control from anon, authenticated;
revoke all on table public.platform_public_config from anon, authenticated;
revoke all on table public.platform_audit from anon, authenticated;

grant select on table public.platform_control, public.platform_audit to authenticated;
grant select on table public.platform_public_config to anon, authenticated;
grant all on table public.platform_control, public.platform_public_config, public.platform_audit
  to service_role;

drop policy if exists "Active superadmins read platform controls"
  on public.platform_control;
create policy "Active superadmins read platform controls"
  on public.platform_control
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and (select public.current_app_role()) = 'superadmin'
  );

drop policy if exists "Anyone reads public platform config"
  on public.platform_public_config;
create policy "Anyone reads public platform config"
  on public.platform_public_config
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Active superadmins read platform audit"
  on public.platform_audit;
create policy "Active superadmins read platform audit"
  on public.platform_audit
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and (select public.current_app_role()) = 'superadmin'
  );

create or replace function public.set_platform_control(
  p_setting text,
  p_enabled boolean,
  p_feature text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  current_control public.platform_control%rowtype;
  next_features jsonb;
  previous_value jsonb;
  next_value jsonb;
  changed boolean := false;
  target_name text;
begin
  if actor_id is null
    or not public.current_user_is_active()
    or public.current_app_role() <> 'superadmin' then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  if p_enabled is null then
    raise exception using errcode = '22023', message = 'invalid-argument';
  end if;

  select *
  into current_control
  from public.platform_control
  where id = 'global'
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'platform-control-not-configured';
  end if;

  next_features := current_control.features;

  if p_setting = 'maintenance' and p_feature is null then
    target_name := 'maintenance';
    previous_value := to_jsonb(current_control.maintenance);
    next_value := to_jsonb(p_enabled);
    changed := current_control.maintenance is distinct from p_enabled;
  elsif p_setting = 'feature'
    and p_feature in ('aiAssistant', 'aiGeneration') then
    target_name := 'features.' || p_feature;
    previous_value := current_control.features -> p_feature;
    next_value := to_jsonb(p_enabled);
    changed := (current_control.features ->> p_feature)::boolean is distinct from p_enabled;
    next_features := jsonb_set(current_control.features, array[p_feature], next_value, false);
  else
    raise exception using errcode = '22023', message = 'invalid-argument';
  end if;

  if changed then
    update public.platform_control
    set maintenance = case
          when p_setting = 'maintenance' then p_enabled
          else current_control.maintenance
        end,
        features = next_features,
        updated_by = actor_id,
        updated_at = now()
    where id = 'global';

    insert into public.platform_audit (
      actor_id, action, target, before_value, after_value
    )
    values (
      actor_id,
      'platform.control.updated',
      target_name,
      previous_value,
      next_value
    );
  end if;

  update public.platform_public_config
  set maintenance = case
        when p_setting = 'maintenance' then p_enabled
        else current_control.maintenance
      end,
      features = next_features,
      updated_at = now()
  where id = 'platform'
    and (
      maintenance is distinct from case
        when p_setting = 'maintenance' then p_enabled
        else current_control.maintenance
      end
      or features is distinct from next_features
    );

  return jsonb_build_object(
    'changed', changed,
    'state', jsonb_build_object(
      'maintenance', case
        when p_setting = 'maintenance' then p_enabled
        else current_control.maintenance
      end,
      'features', next_features
    )
  );
end;
$$;

revoke all on function public.set_platform_control(text, boolean, text)
  from public, anon;
grant execute on function public.set_platform_control(text, boolean, text)
  to authenticated;
