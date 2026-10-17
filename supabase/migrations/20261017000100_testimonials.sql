create table if not exists public.testimonials (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  role text not null,
  school text not null default '',
  quote text not null check (char_length(quote) between 20 and 500),
  quote_public text not null default '',
  rating smallint not null check (rating between 4 and 5),
  consent boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending', 'published', 'rejected')),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (tenant_id, user_id),
  check (status <> 'published' or (consent and char_length(quote_public) between 20 and 300))
);

create index if not exists testimonials_public_idx
  on public.testimonials (submitted_at desc)
  where status = 'published' and consent;

alter table public.testimonials enable row level security;
revoke all on table public.testimonials from anon, authenticated;
grant select on table public.testimonials to authenticated;
grant select (id,tenant_id,display_name,role,school,quote_public,rating,consent,status,submitted_at)
  on table public.testimonials to anon;
grant insert (tenant_id, user_id, display_name, role, school, quote, rating, consent, status)
  on table public.testimonials to authenticated;
grant update (display_name, school, quote, rating, consent)
  on table public.testimonials to authenticated;
grant all on table public.testimonials to service_role;

drop policy if exists "Published consented testimonials are public" on public.testimonials;
create policy "Published consented testimonials are public"
  on public.testimonials
  for select
  to anon, authenticated
  using (status = 'published' and consent = true);

drop policy if exists "Authors read their testimonials" on public.testimonials;
create policy "Authors read their testimonials"
  on public.testimonials
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_user_is_active())
  );

drop policy if exists "Active tenant admins read testimonials" on public.testimonials;
create policy "Active tenant admins read testimonials"
  on public.testimonials
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and (
      (select public.current_app_role()) = 'superadmin'
      or (
        (select public.current_app_role()) = 'admin_sekolah'
        and tenant_id = (select public.current_tenant_id())
      )
    )
  );

drop policy if exists "Active tenant members submit testimonials" on public.testimonials;
create policy "Active tenant members submit testimonials"
  on public.testimonials
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_user_is_active())
    and status = 'pending'
    and consent = true
  );

drop policy if exists "Authors edit pending testimonials" on public.testimonials;
create policy "Authors edit pending testimonials"
  on public.testimonials
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and status = 'pending'
    and (select public.current_user_is_active())
  )
  with check (
    user_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and status = 'pending'
    and consent = true
    and (select public.current_user_is_active())
  );

create or replace function public.set_testimonial_moderation(
  p_testimonial_id uuid,
  p_decision text,
  p_public_quote text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.testimonials%rowtype;
  moderated_quote text := btrim(coalesce(p_public_quote, ''));
begin
  if not public.current_user_is_active()
    or not (
      public.current_app_role() = 'superadmin'
      or public.current_app_role() = 'admin_sekolah'
    ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  if p_decision is null or p_decision not in ('published', 'rejected') then
    raise exception using errcode = '22023', message = 'invalid-decision';
  end if;

  select *
  into item
  from public.testimonials
  where id = p_testimonial_id
    and (
      public.current_app_role() = 'superadmin'
      or tenant_id = public.current_tenant_id()
    )
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'testimonial-not-found';
  end if;

  if p_decision = 'published' and (
    not item.consent
    or char_length(moderated_quote) < 20
    or char_length(moderated_quote) > 300
  ) then
    raise exception using errcode = '22023', message = 'invalid-public-quote';
  end if;

  update public.testimonials
  set status = p_decision,
      quote_public = case when p_decision = 'published' then moderated_quote else '' end,
      reviewed_at = now(),
      updated_at = now()
  where id = p_testimonial_id;
end;
$$;

revoke all on function public.set_testimonial_moderation(uuid, text, text)
  from public, anon;
grant execute on function public.set_testimonial_moderation(uuid, text, text)
  to authenticated;

drop trigger if exists testimonials_set_updated_at on public.testimonials;
create trigger testimonials_set_updated_at
  before update on public.testimonials
  for each row execute function public.set_updated_at();
