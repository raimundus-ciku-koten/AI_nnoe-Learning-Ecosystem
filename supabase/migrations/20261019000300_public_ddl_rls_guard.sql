create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  ddl_command record;
  table_name name;
begin
  for ddl_command in
    select *
    from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table', 'partitioned table')
  loop
    if ddl_command.schema_name = 'public' then
      select relation.relname
      into table_name
      from pg_catalog.pg_class as relation
      where relation.oid = ddl_command.objid;

      execute format(
        'alter table if exists %I.%I enable row level security',
        ddl_command.schema_name,
        table_name
      );
    end if;
  end loop;
end;
$$;

revoke all on function public.rls_auto_enable()
  from public, anon, authenticated;

do $$
declare
  existing_trigger record;
begin
  select evtevent, evtenabled, evtfoid, evttags
  into existing_trigger
  from pg_event_trigger
  where evtname = 'ensure_rls';

  if found then
    if existing_trigger.evtevent <> 'ddl_command_end'
      or existing_trigger.evtenabled <> 'O'
      or existing_trigger.evtfoid <> 'public.rls_auto_enable()'::regprocedure::oid
      or existing_trigger.evttags is distinct from
        array['CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO']::text[] then
      raise exception 'Existing ensure_rls event trigger does not match the reviewed definition';
    end if;
  else
    execute $create_event_trigger$
      create event trigger ensure_rls
      on ddl_command_end
      when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      execute function public.rls_auto_enable()
    $create_event_trigger$;
  end if;
end;
$$;
