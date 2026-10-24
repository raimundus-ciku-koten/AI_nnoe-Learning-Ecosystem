alter table public.platform_control
  alter column features set default '{"aiAssistant":false,"aiGeneration":false}'::jsonb;

alter table public.platform_public_config
  alter column features set default '{"aiAssistant":false,"aiGeneration":false}'::jsonb;

update public.platform_control
set features = '{"aiAssistant":false,"aiGeneration":false}'::jsonb,
    updated_at = now()
where id = 'global'
  and updated_by is null;

update public.platform_public_config
set features = '{"aiAssistant":false,"aiGeneration":false}'::jsonb,
    updated_at = now()
where id = 'platform'
  and exists (
    select 1
    from public.platform_control
    where id = 'global'
      and updated_by is null
      and features = '{"aiAssistant":false,"aiGeneration":false}'::jsonb
  );
