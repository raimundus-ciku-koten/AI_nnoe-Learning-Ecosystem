create or replace function public.school_admin_attendance_report()
returns table (
  tanggal date,
  kelas text,
  hadir_scan bigint
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
    raise exception 'Admin sekolah aktif diperlukan untuk melihat laporan kehadiran.'
      using errcode = '42501';
  end if;

  return query
  select attendance.tanggal, attendance.kelas, count(*)::bigint
  from public.attendance_records as attendance
  where attendance.tenant_id = (select public.current_tenant_id())
    and attendance.status = 'hadir'
    and attendance.metode = 'scan'
    and attendance.tanggal >= current_date - 89
  group by attendance.tanggal, attendance.kelas
  order by attendance.tanggal desc, attendance.kelas;
end;
$$;

create or replace function public.school_admin_payment_orders()
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

  return query
  select purchase.order_id, purchase.plan_name, purchase.billing_cycle,
    purchase.subtotal, purchase.tax_amount, purchase.total, purchase.status,
    purchase.payment_status, purchase.created_at, purchase.paid_at, purchase.expires_at
  from public.payment_orders as purchase
  where purchase.tenant_id = (select public.current_tenant_id())
    and purchase.product_type = 'school'
  order by purchase.created_at desc, purchase.order_id
  limit 100;
end;
$$;

revoke all on function public.school_admin_attendance_report() from public, anon;
revoke all on function public.school_admin_payment_orders() from public, anon;
grant execute on function public.school_admin_attendance_report() to authenticated;
grant execute on function public.school_admin_payment_orders() to authenticated;
