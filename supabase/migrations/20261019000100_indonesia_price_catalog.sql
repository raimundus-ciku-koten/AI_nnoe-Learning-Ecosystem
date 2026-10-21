update public.billing_plans as plans
set annual_price = updates.annual_price
from (values
  ('sekolah-basic', 2990000),
  ('sekolah-pro', 6990000),
  ('sekolah-enterprise', 14990000)
) as updates(id, annual_price)
where plans.id = updates.id;
