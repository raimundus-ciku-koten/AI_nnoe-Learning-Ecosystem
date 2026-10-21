create table if not exists public.testimonial_submissions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  tenant_id text not null references public.tenants(id) on delete restrict,
  display_name text not null check (
    char_length(display_name) between 1 and 80
    and display_name = btrim(display_name)
  ),
  role text not null check (char_length(role) between 1 and 40),
  quote text not null check (char_length(quote) between 20 and 500),
  rating smallint not null check (rating between 4 and 5),
  consent boolean not null check (consent = true),
  status text not null default 'pending'
    check (status in ('pending', 'rejected', 'published')),
  quote_final text check (quote_final is null or char_length(quote_final) between 20 and 300),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewer_id uuid references public.profiles(id) on delete set null,
  unique (owner_id)
);

create index if not exists testimonial_submissions_tenant_status_idx
  on public.testimonial_submissions (tenant_id, status, submitted_at desc);

drop trigger if exists testimonial_submissions_set_updated_at
  on public.testimonial_submissions;
create trigger testimonial_submissions_set_updated_at
  before update on public.testimonial_submissions
  for each row execute function public.set_updated_at();

alter table public.testimonial_submissions enable row level security;
revoke all on table public.testimonial_submissions from public, anon, authenticated;
grant select on table public.testimonial_submissions to authenticated;
grant insert (owner_id, tenant_id, display_name, role, quote, rating, consent)
  on table public.testimonial_submissions to authenticated;
grant update (owner_id, tenant_id, display_name, role, quote, rating, consent)
  on table public.testimonial_submissions to authenticated;
grant all on table public.testimonial_submissions to service_role;

drop policy if exists "Owners and tenant admins read testimonial submissions"
  on public.testimonial_submissions;
create policy "Owners and tenant admins read testimonial submissions"
  on public.testimonial_submissions
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    or (
      tenant_id = (select public.current_tenant_id())
      and (select public.current_app_role()) in ('admin_sekolah', 'superadmin')
      and (select public.current_user_is_active())
    )
    or (
      (select public.current_app_role()) = 'superadmin'
      and (select public.current_user_is_active())
    )
  );

drop policy if exists "Active tenant members submit their own testimonials"
  on public.testimonial_submissions;
create policy "Active tenant members submit their own testimonials"
  on public.testimonial_submissions
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and role = (select public.current_app_role())
    and status = 'pending'
    and (select public.current_user_is_active())
    and exists (
      select 1
      from public.profiles as profile
      where profile.id = (select auth.uid())
        and profile.tenant_id = testimonial_submissions.tenant_id
        and profile.active
    )
  );

drop policy if exists "Owners update unpublished testimonial submissions"
  on public.testimonial_submissions;
create policy "Owners update unpublished testimonial submissions"
  on public.testimonial_submissions
  for update
  to authenticated
  using (
    owner_id = (select auth.uid())
    and status <> 'published'
  )
  with check (
    owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and role = (select public.current_app_role())
    and status <> 'published'
    and (select public.current_user_is_active())
  );

create or replace function public.moderate_testimonial(
  p_submission_id uuid,
  p_decision text,
  p_quote_final text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  submission public.testimonial_submissions%rowtype;
  reviewed_quote text;
begin
  if actor_id is null
    or not public.current_user_is_active()
    or public.current_app_role() not in ('admin_sekolah', 'superadmin') then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  if p_decision is null or p_decision not in ('published', 'rejected') then
    raise exception using errcode = '22023', message = 'invalid-decision';
  end if;

  select *
  into submission
  from public.testimonial_submissions
  where id = p_submission_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'testimonial-not-found';
  end if;

  if public.current_app_role() <> 'superadmin'
    and submission.tenant_id <> public.current_tenant_id() then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  reviewed_quote := nullif(btrim(coalesce(p_quote_final, '')), '');
  if p_decision = 'published'
    and (reviewed_quote is null or char_length(reviewed_quote) not between 20 and 300) then
    raise exception using errcode = '22023', message = 'invalid-public-quote';
  end if;

  update public.testimonial_submissions
  set status = p_decision,
      quote_final = case when p_decision = 'published' then reviewed_quote else null end,
      reviewer_id = actor_id,
      reviewed_at = now()
  where id = submission.id;

  if p_decision = 'published' then
    insert into public.testimonials (
      id, tenant_id, display_name, role, quote, consent, status, published_at
    )
    values (
      submission.id,
      submission.tenant_id,
      submission.display_name,
      submission.role,
      reviewed_quote,
      true,
      'published',
      now()
    )
    on conflict (id) do update
    set tenant_id = excluded.tenant_id,
        display_name = excluded.display_name,
        role = excluded.role,
        quote = excluded.quote,
        consent = excluded.consent,
        status = excluded.status,
        published_at = excluded.published_at;
  else
    delete from public.testimonials
    where id = submission.id;
  end if;

  return jsonb_build_object(
    'id', submission.id,
    'status', p_decision,
    'published', p_decision = 'published'
  );
end;
$$;

revoke all on function public.moderate_testimonial(uuid, text, text)
  from public, anon;
grant execute on function public.moderate_testimonial(uuid, text, text)
  to authenticated;
