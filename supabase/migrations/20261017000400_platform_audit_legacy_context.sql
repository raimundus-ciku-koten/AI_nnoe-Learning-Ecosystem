alter table public.platform_audit
  add column if not exists legacy_context jsonb;

comment on column public.platform_audit.legacy_context is
  'Restricted historical source context retained during legacy audit migration; not used for authorization.';
