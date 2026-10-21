create table if not exists public.testimonials (
  id uuid primary key,
  tenant_id text not null references public.tenants(id) on delete restrict,
  display_name text not null check (
    char_length(display_name) between 1 and 80
    and display_name = btrim(display_name)
  ),
  role text not null check (
    char_length(role) between 1 and 40
    and role = btrim(role)
  ),
  quote text not null check (
    char_length(quote) between 1 and 300
  ),
  consent boolean not null check (consent = true),
  status text not null check (status = 'published'),
  published_at timestamptz not null
);

create index if not exists testimonials_public_feed_idx
  on public.testimonials (published_at desc, id)
  where status = 'published' and consent = true;

alter table public.testimonials enable row level security;

revoke all on table public.testimonials from public, anon, authenticated;
grant select (
  id, tenant_id, display_name, role, quote, consent, status
) on table public.testimonials to anon, authenticated;
grant all on table public.testimonials to service_role;

drop policy if exists "Anyone reads consented published testimonials"
  on public.testimonials;
create policy "Anyone reads consented published testimonials"
  on public.testimonials
  for select
  to anon, authenticated
  using (status = 'published' and consent = true);
