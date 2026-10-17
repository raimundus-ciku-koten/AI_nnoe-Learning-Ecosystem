insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-media', 'profile-media', false, 131072, array['image/jpeg'])
on conflict (id) do update
set public = false,
    file_size_limit = 131072,
    allowed_mime_types = array['image/jpeg'];

drop policy if exists "Active tenant members read profile avatars" on storage.objects;
create policy "Active tenant members read profile avatars"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'profile-media'
    and name ~ '^profiles/[A-Za-z0-9_-]{1,128}/[A-Za-z0-9_-]{1,128}/avatar\.jpg$'
    and (storage.foldername(name))[1] = 'profiles'
    and (select public.current_user_is_active())
    and (
      (storage.foldername(name))[2] = (select public.current_tenant_id())
      or (
        (storage.foldername(name))[2] = 'platform'
        and (select public.current_app_role()) = 'superadmin'
      )
    )
  );

drop policy if exists "Users upload their own profile avatar" on storage.objects;
create policy "Users upload their own profile avatar"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'profile-media'
    and name ~ '^profiles/[A-Za-z0-9_-]{1,128}/[A-Za-z0-9_-]{1,128}/avatar\.jpg$'
    and (storage.foldername(name))[1] = 'profiles'
    and (storage.foldername(name))[3] = (select auth.uid())::text
    and (select public.current_user_is_active())
    and (
      (storage.foldername(name))[2] = (select public.current_tenant_id())
      or (
        (storage.foldername(name))[2] = 'platform'
        and (select public.current_app_role()) = 'superadmin'
      )
    )
  );

drop policy if exists "Users update their own profile avatar" on storage.objects;
create policy "Users update their own profile avatar"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'profile-media'
    and name ~ '^profiles/[A-Za-z0-9_-]{1,128}/[A-Za-z0-9_-]{1,128}/avatar\.jpg$'
    and (storage.foldername(name))[1] = 'profiles'
    and (storage.foldername(name))[3] = (select auth.uid())::text
    and (select public.current_user_is_active())
    and (
      (storage.foldername(name))[2] = (select public.current_tenant_id())
      or (
        (storage.foldername(name))[2] = 'platform'
        and (select public.current_app_role()) = 'superadmin'
      )
    )
  )
  with check (
    bucket_id = 'profile-media'
    and name ~ '^profiles/[A-Za-z0-9_-]{1,128}/[A-Za-z0-9_-]{1,128}/avatar\.jpg$'
    and (storage.foldername(name))[1] = 'profiles'
    and (storage.foldername(name))[3] = (select auth.uid())::text
    and (select public.current_user_is_active())
    and (
      (storage.foldername(name))[2] = (select public.current_tenant_id())
      or (
        (storage.foldername(name))[2] = 'platform'
        and (select public.current_app_role()) = 'superadmin'
      )
    )
  );

drop policy if exists "Users delete their own profile avatar" on storage.objects;
create policy "Users delete their own profile avatar"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'profile-media'
    and name ~ '^profiles/[A-Za-z0-9_-]{1,128}/[A-Za-z0-9_-]{1,128}/avatar\.jpg$'
    and (storage.foldername(name))[1] = 'profiles'
    and (storage.foldername(name))[3] = (select auth.uid())::text
    and (select public.current_user_is_active())
    and (
      (storage.foldername(name))[2] = (select public.current_tenant_id())
      or (
        (storage.foldername(name))[2] = 'platform'
        and (select public.current_app_role()) = 'superadmin'
      )
    )
  );

create table if not exists public.app_reviews (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tenant_id text references public.tenants(id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 500),
  updated_at timestamptz not null default now()
);

drop trigger if exists app_reviews_set_updated_at on public.app_reviews;
create trigger app_reviews_set_updated_at
  before update on public.app_reviews
  for each row execute function public.set_updated_at();

alter table public.app_reviews enable row level security;
revoke all on table public.app_reviews from anon, authenticated;
grant select, insert (user_id, tenant_id, rating, comment)
  on public.app_reviews to authenticated;
grant update (tenant_id, rating, comment)
  on public.app_reviews to authenticated;
grant all on public.app_reviews to service_role;

drop policy if exists "Users read their own app review" on public.app_reviews;
create policy "Users read their own app review"
  on public.app_reviews
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and (select public.current_user_is_active())
    and (
      tenant_id = (select public.current_tenant_id())
      or (
        tenant_id is null
        and (select public.current_app_role()) = 'superadmin'
      )
    )
  );

drop policy if exists "Users create their own app review" on public.app_reviews;
create policy "Users create their own app review"
  on public.app_reviews
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.current_user_is_active())
    and (
      tenant_id = (select public.current_tenant_id())
      or (
        tenant_id is null
        and (select public.current_app_role()) = 'superadmin'
      )
    )
  );

drop policy if exists "Users update their own app review" on public.app_reviews;
create policy "Users update their own app review"
  on public.app_reviews
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    and (select public.current_user_is_active())
    and (
      tenant_id = (select public.current_tenant_id())
      or (
        tenant_id is null
        and (select public.current_app_role()) = 'superadmin'
      )
    )
  )
  with check (
    user_id = (select auth.uid())
    and (select public.current_user_is_active())
    and (
      tenant_id = (select public.current_tenant_id())
      or (
        tenant_id is null
        and (select public.current_app_role()) = 'superadmin'
      )
    )
  );
