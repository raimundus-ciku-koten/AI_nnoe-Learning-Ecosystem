-- The project owner is the initial superadmin. This file contains no secrets.
insert into public.user_allowlist (email, role, tenant_id, active)
values ('kotenraimundusc@gmail.com', 'superadmin', null, true)
on conflict (email) do update
set role = excluded.role,
    tenant_id = excluded.tenant_id,
    active = excluded.active;
