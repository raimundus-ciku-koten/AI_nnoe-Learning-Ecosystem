create table if not exists public.billing_plans (
  id text primary key check (char_length(id) between 1 and 80),
  product_type text not null check (product_type in ('school', 'individual')),
  allowed_role text not null check (allowed_role in ('admin_sekolah', 'guru', 'siswa')),
  user_type text check (user_type in ('teacher', 'student')),
  name text not null check (char_length(name) between 1 and 120),
  annual_price integer not null check (annual_price > 0),
  monthly_divisor integer not null default 10 check (monthly_divisor between 1 and 24),
  student_capacity integer check (student_capacity is null or student_capacity > 0),
  teacher_capacity integer check (teacher_capacity is null or teacher_capacity > 0),
  features text not null default '',
  active boolean not null default true,
  check (
    (product_type = 'school' and allowed_role = 'admin_sekolah' and user_type is null)
    or (product_type = 'individual' and allowed_role in ('guru', 'siswa') and user_type is not null)
  )
);

insert into public.billing_plans (
  id, product_type, allowed_role, user_type, name, annual_price,
  student_capacity, teacher_capacity, features
) values
  ('sekolah-basic', 'school', 'admin_sekolah', null, 'Sekolah Basic', 3500000, 100, 20, '100 siswa, 20 guru'),
  ('sekolah-pro', 'school', 'admin_sekolah', null, 'Sekolah Pro', 7500000, 500, 100, '500 siswa, 100 guru'),
  ('sekolah-enterprise', 'school', 'admin_sekolah', null, 'Sekolah Enterprise', 15000000, 1500, null, '1.500 siswa, jumlah guru tanpa batas'),
  ('siswa-basic', 'individual', 'siswa', 'student', 'Siswa Basic', 149000, null, null, 'Ujian online, materi ringkas, nilai, 1 mapel pilihan'),
  ('siswa-pro', 'individual', 'siswa', 'student', 'Siswa Pro', 249000, null, null, 'Semua mapel, bank soal lengkap, tryout, analitik belajar'),
  ('siswa-premium', 'individual', 'siswa', 'student', 'Siswa Premium', 399000, null, null, 'AI tutor, pembahasan adaptif, prioritas materi baru'),
  ('guru-sd-basic', 'individual', 'guru', 'teacher', 'Guru Kelas SD Basic', 199000, null, null, '3 mapel, bank soal 150, 2 ujian, 1 kelas'),
  ('guru-sd-pro', 'individual', 'guru', 'teacher', 'Guru Kelas SD Pro', 349000, null, null, '6 mapel, AI Generator 200 soal/bulan, anti-curang, 3 kelas'),
  ('guru-sd-premium', 'individual', 'guru', 'teacher', 'Guru Kelas SD Premium', 499000, null, null, 'Mapel dan AI tanpa batas, chat orang tua, 5 kelas, dukungan prioritas'),
  ('guru-mapel-basic', 'individual', 'guru', 'teacher', 'Guru Mapel Basic', 149000, null, null, '1 mapel, bank soal 100, 2 ujian, 1 kelas'),
  ('guru-mapel-pro', 'individual', 'guru', 'teacher', 'Guru Mapel Pro', 249000, null, null, '1 mapel + paralel, AI Generator 200 soal/bulan, anti-curang, 5 kelas'),
  ('guru-mapel-premium', 'individual', 'guru', 'teacher', 'Guru Mapel Premium', 399000, null, null, 'AI dan ujian tanpa batas, chat 1-on-1, 10 kelas, analitik lanjutan')
on conflict (id) do nothing;

create table if not exists public.personal_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_id text not null references public.billing_plans(id) on delete restrict,
  status text not null check (status in ('trial', 'active', 'past_due', 'suspended', 'cancelled')),
  valid_until timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_orders (
  order_id text primary key check (order_id ~ '^ALE-[0-9a-f-]{36}$'),
  owner_id uuid not null references auth.users(id) on delete restrict,
  tenant_id text references public.tenants(id) on delete restrict,
  product_type text not null check (product_type in ('school', 'individual')),
  plan_id text not null references public.billing_plans(id) on delete restrict,
  plan_name text not null check (char_length(plan_name) between 1 and 120),
  billing_cycle text not null check (billing_cycle in ('bulanan', 'tahunan')),
  subtotal integer not null check (subtotal > 0),
  tax_amount integer not null check (tax_amount >= 0),
  total integer not null check (total = subtotal + tax_amount),
  status text not null check (status in ('creating', 'pending', 'paid', 'paid_review', 'failed')),
  payment_status text,
  midtrans_transaction_id text,
  redirect_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  paid_at timestamptz,
  check (
    (product_type = 'school' and tenant_id is not null)
    or product_type = 'individual'
  )
);

create index if not exists payment_orders_owner_created_idx
  on public.payment_orders (owner_id, created_at desc);
create unique index if not exists payment_orders_one_open_per_owner
  on public.payment_orders (owner_id)
  where status in ('creating', 'pending');

alter table public.billing_plans enable row level security;
alter table public.personal_entitlements enable row level security;
alter table public.payment_orders enable row level security;

revoke all on table public.billing_plans, public.personal_entitlements, public.payment_orders
  from anon, authenticated;
grant select on table public.billing_plans, public.personal_entitlements, public.payment_orders
  to authenticated;
grant all on table public.billing_plans, public.personal_entitlements, public.payment_orders
  to service_role;

drop policy if exists "Authenticated users read active billing plans"
  on public.billing_plans;
create policy "Authenticated users read active billing plans"
  on public.billing_plans
  for select
  to authenticated
  using (
    active = true
    and (select public.current_user_is_active())
  );

drop policy if exists "Users read their personal entitlement"
  on public.personal_entitlements;
create policy "Users read their personal entitlement"
  on public.personal_entitlements
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and user_id = (select auth.uid())
  );

drop policy if exists "Users read their own payment orders"
  on public.payment_orders;
create policy "Users read their own payment orders"
  on public.payment_orders
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and owner_id = (select auth.uid())
  );

create or replace function public.finalize_midtrans_payment(
  p_order_id text,
  p_state text,
  p_payment_status text,
  p_transaction_id text,
  p_verified_total integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  purchase public.payment_orders%rowtype;
  current_plan text;
  current_status text;
  current_valid_until timestamptz;
  starts_at timestamptz;
  ends_at timestamptz;
begin
  if p_state not in ('pending', 'paid', 'failed')
    or p_payment_status is null
    or char_length(p_payment_status) > 80
    or p_verified_total is null
    or p_verified_total < 1 then
    raise exception using errcode = '22023', message = 'invalid-midtrans-result';
  end if;

  select *
    into purchase
    from public.payment_orders
    where order_id = p_order_id
    for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'payment-order-not-found';
  end if;
  if purchase.total <> p_verified_total then
    raise exception using errcode = '22023', message = 'payment-amount-mismatch';
  end if;
  if purchase.status in ('paid', 'paid_review') then
    return purchase.status;
  end if;

  if p_state = 'pending' then
    update public.payment_orders
      set payment_status = p_payment_status,
          midtrans_transaction_id = nullif(p_transaction_id, ''),
          updated_at = now()
      where order_id = p_order_id;
    return 'pending';
  end if;

  if p_state = 'failed' then
    update public.payment_orders
      set status = 'failed',
          payment_status = p_payment_status,
          midtrans_transaction_id = nullif(p_transaction_id, ''),
          updated_at = now()
      where order_id = p_order_id;
    return 'failed';
  end if;

  if purchase.product_type = 'school' then
    select plan_id, status, valid_until
      into current_plan, current_status, current_valid_until
      from public.tenant_entitlements
      where tenant_id = purchase.tenant_id
      for update;
  else
    select plan_id, status, valid_until
      into current_plan, current_status, current_valid_until
      from public.personal_entitlements
      where user_id = purchase.owner_id
      for update;
  end if;

  if current_status in ('trial', 'active')
    and (current_valid_until is null or current_valid_until > now())
    and current_plan <> purchase.plan_id then
    update public.payment_orders
      set status = 'paid_review',
          payment_status = p_payment_status,
          midtrans_transaction_id = nullif(p_transaction_id, ''),
          paid_at = now(),
          updated_at = now()
      where order_id = p_order_id;
    return 'paid_review';
  end if;

  starts_at := greatest(coalesce(current_valid_until, now()), now());
  ends_at := case purchase.billing_cycle
    when 'bulanan' then starts_at + interval '1 month'
    when 'tahunan' then starts_at + interval '1 year'
  end;

  if purchase.product_type = 'school' then
    insert into public.tenant_entitlements (
      tenant_id, plan_id, status, valid_until, updated_by, updated_at
    )
    values (
      purchase.tenant_id, purchase.plan_id, 'active', ends_at, purchase.owner_id, now()
    )
    on conflict (tenant_id) do update
      set plan_id = excluded.plan_id,
          status = 'active',
          valid_until = excluded.valid_until,
          updated_by = excluded.updated_by,
          updated_at = now();
  else
    insert into public.personal_entitlements (user_id, plan_id, status, valid_until, updated_at)
    values (purchase.owner_id, purchase.plan_id, 'active', ends_at, now())
    on conflict (user_id) do update
      set plan_id = excluded.plan_id,
          status = 'active',
          valid_until = excluded.valid_until,
          updated_at = now();
  end if;

  update public.payment_orders
    set status = 'paid',
        payment_status = p_payment_status,
        midtrans_transaction_id = nullif(p_transaction_id, ''),
        paid_at = now(),
        updated_at = now()
    where order_id = p_order_id;
  return 'paid';
end;
$$;

revoke all on function public.finalize_midtrans_payment(text, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.finalize_midtrans_payment(text, text, text, text, integer)
  to service_role;
