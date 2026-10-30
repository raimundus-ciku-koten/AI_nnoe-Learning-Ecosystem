create index if not exists payment_orders_tenant_created_idx
  on public.payment_orders (tenant_id, created_at desc, order_id desc)
  where product_type = 'school';

create or replace function public.school_admin_payment_order_summary(
  p_start_date date,
  p_end_date date
)
returns table (
  order_count bigint,
  paid_count bigint,
  pending_count bigint,
  failed_count bigint,
  paid_amount bigint,
  pending_amount bigint,
  paid_review_count bigint,
  paid_review_amount bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'admin_sekolah'
    or not exists (
      select 1 from public.tenants as tenant
      where tenant.id = (select public.current_tenant_id())
        and tenant.active = true
    )
  then
    raise exception 'Admin sekolah aktif diperlukan untuk melihat ringkasan keuangan.'
      using errcode = '42501';
  end if;

  if p_start_date is null or p_end_date is null
    or p_start_date > p_end_date
    or p_end_date - p_start_date > 365
    or p_end_date > (now() at time zone 'UTC')::date then
    raise exception 'Rentang laporan keuangan harus 1 sampai 366 hari dan tidak melewati hari ini.'
      using errcode = '22023';
  end if;

  return query
  select
    count(*)::bigint,
    count(*) filter (where purchase.status = 'paid')::bigint,
    count(*) filter (where purchase.status in ('creating', 'pending'))::bigint,
    count(*) filter (where purchase.status = 'failed')::bigint,
    coalesce(sum(purchase.total) filter (where purchase.status = 'paid'), 0)::bigint,
    coalesce(sum(purchase.total) filter (where purchase.status in ('creating', 'pending')), 0)::bigint,
    count(*) filter (where purchase.status = 'paid_review')::bigint,
    coalesce(sum(purchase.total) filter (where purchase.status = 'paid_review'), 0)::bigint
  from public.payment_orders as purchase
  where purchase.tenant_id = (select public.current_tenant_id())
    and purchase.product_type = 'school'
    and purchase.created_at >= (p_start_date::timestamp at time zone 'UTC')
    and purchase.created_at < ((p_end_date + 1)::timestamp at time zone 'UTC');
end;
$$;

create or replace function public.school_admin_payment_orders_page(
  p_start_date date,
  p_end_date date,
  p_status text default null,
  p_after_created_at timestamptz default null,
  p_after_order_id text default null,
  p_limit integer default 51
)
returns table (
  order_id text,
  plan_name text,
  billing_cycle text,
  subtotal integer,
  tax_amount integer,
  total integer,
  status text,
  payment_status text,
  created_at timestamptz,
  paid_at timestamptz,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'admin_sekolah'
    or not exists (
      select 1 from public.tenants as tenant
      where tenant.id = (select public.current_tenant_id())
        and tenant.active = true
    )
  then
    raise exception 'Admin sekolah aktif diperlukan untuk melihat pesanan tenant.'
      using errcode = '42501';
  end if;

  if p_start_date is null or p_end_date is null
    or p_start_date > p_end_date
    or p_end_date - p_start_date > 365
    or p_end_date > (now() at time zone 'UTC')::date
    or (p_status is not null and p_status not in ('creating', 'pending', 'paid', 'paid_review', 'failed'))
    or p_limit is null
    or p_limit not between 1 and 101
    or ((p_after_created_at is null) <> (p_after_order_id is null)) then
    raise exception 'Filter, kursor, atau ukuran halaman pesanan tidak valid.'
      using errcode = '22023';
  end if;

  return query
  select purchase.order_id, purchase.plan_name, purchase.billing_cycle,
    purchase.subtotal, purchase.tax_amount, purchase.total, purchase.status,
    purchase.payment_status, purchase.created_at, purchase.paid_at, purchase.expires_at
  from public.payment_orders as purchase
  where purchase.tenant_id = (select public.current_tenant_id())
    and purchase.product_type = 'school'
    and purchase.created_at >= (p_start_date::timestamp at time zone 'UTC')
    and purchase.created_at < ((p_end_date + 1)::timestamp at time zone 'UTC')
    and (p_status is null or purchase.status = p_status)
    and (p_after_created_at is null
      or (purchase.created_at, purchase.order_id) < (p_after_created_at, p_after_order_id))
  order by purchase.created_at desc, purchase.order_id desc
  limit p_limit;
end;
$$;

revoke all on function public.school_admin_payment_order_summary(date, date)
  from public, anon;
revoke all on function public.school_admin_payment_orders_page(date, date, text, timestamptz, text, integer)
  from public, anon;
grant execute on function public.school_admin_payment_order_summary(date, date)
  to authenticated;
grant execute on function public.school_admin_payment_orders_page(date, date, text, timestamptz, text, integer)
  to authenticated;
