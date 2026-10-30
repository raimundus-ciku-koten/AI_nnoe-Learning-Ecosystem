create or replace function public.platform_tenant_directory_page(
  p_after text default null,
  p_limit integer default 40
)
returns table (
  tenant_id text,
  tenant_name text,
  tenant_active boolean,
  profile_count bigint,
  active_profile_count bigint,
  student_count bigint,
  latest_plan_name text,
  latest_order_status text,
  latest_order_created_at timestamptz,
  latest_order_total integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'superadmin'
  then
    raise exception 'Superadmin aktif diperlukan untuk melihat direktori tenant.'
      using errcode = '42501';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100
    or (p_after is not null and btrim(p_after) = '') then
    raise exception 'Parameter halaman tenant tidak valid.'
      using errcode = '22023';
  end if;

  return query
  select
    tenant.id,
    tenant.name,
    tenant.active,
    coalesce(profiles.profile_count, 0)::bigint,
    coalesce(profiles.active_profile_count, 0)::bigint,
    coalesce(students.student_count, 0)::bigint,
    latest_order.plan_name,
    latest_order.status,
    latest_order.created_at,
    latest_order.total
  from public.tenants as tenant
  left join lateral (
    select
      count(*) as profile_count,
      count(*) filter (where profile.active = true) as active_profile_count
    from public.profiles as profile
    where profile.tenant_id = tenant.id
  ) as profiles on true
  left join lateral (
    select count(*) as student_count
    from public.students as student
    where student.tenant_id = tenant.id
  ) as students on true
  left join lateral (
    select purchase.plan_name, purchase.status, purchase.created_at, purchase.total
    from public.payment_orders as purchase
    where purchase.tenant_id = tenant.id
      and purchase.product_type = 'school'
    order by purchase.created_at desc, purchase.order_id desc
    limit 1
  ) as latest_order on true
  where p_after is null or tenant.id > p_after
  order by tenant.id
  limit p_limit;
end;
$$;

revoke all on function public.platform_tenant_directory_page(text, integer)
  from public, anon;
grant execute on function public.platform_tenant_directory_page(text, integer)
  to authenticated;
