create or replace function public.list_chat_directory()
returns table (
  uid uuid,
  nama text,
  role text,
  photo_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  select profile.id, profile.nama, profile.role, profile.photo_url
  from public.profiles as profile
  where (select public.current_user_is_active())
    and profile.id <> (select auth.uid())
    and profile.active = true
    and profile.role not in ('unprovisioned', 'demo')
    and (
      (
        (select public.current_app_role()) = 'superadmin'
        and (
          profile.role = 'superadmin'
          or exists (
            select 1
            from public.tenants as tenant
            where tenant.id = profile.tenant_id
              and tenant.active = true
          )
        )
      )
      or (
        (select public.current_app_role()) <> 'superadmin'
        and profile.tenant_id = (select public.current_tenant_id())
        and exists (
          select 1
          from public.tenants as tenant
          where tenant.id = profile.tenant_id
            and tenant.active = true
        )
      )
    )
  order by profile.nama, profile.id
$$;

revoke all on function public.list_chat_directory() from public, anon;
grant execute on function public.list_chat_directory() to authenticated;

alter table public.chat_presence
  add column if not exists online boolean not null default false;
grant insert (user_id, last_seen_at, online)
  on table public.chat_presence to authenticated;
grant update (last_seen_at, online)
  on table public.chat_presence to authenticated;

do $$
declare
  relation_name text;
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication
    where pubname = 'supabase_realtime'
  ) then
    raise exception 'Supabase Realtime publication is missing.';
  end if;

  foreach relation_name in array array[
    'chat_contacts',
    'chat_conversations',
    'chat_messages',
    'chat_read_receipts',
    'chat_presence'
  ]
  loop
    if not exists (
      select 1
      from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = relation_name
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        relation_name
      );
    end if;
  end loop;
end;
$$;
