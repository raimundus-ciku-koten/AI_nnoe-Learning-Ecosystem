begin read only;

with expected_feature_relations(name) as (
  values
    ('school_access_index'),
    ('user_encryption_keys'),
    ('drive_file_index'),
    ('drive_file_access'),
    ('drive_file_key_envelopes'),
    ('security_audit'),
    ('tenant_entitlements'),
    ('students'),
    ('attendance_records'),
    ('testimonials'),
    ('school_announcements'),
    ('school_units'),
    ('chat_conversations'),
    ('chat_messages'),
    ('chat_read_receipts'),
    ('chat_inbox'),
    ('chat_contacts'),
    ('chat_presence'),
    ('billing_plans'),
    ('personal_entitlements'),
    ('payment_orders'),
    ('testimonial_submissions'),
    ('question_bank'),
    ('web_push_subscriptions'),
    ('chat_push_dispatches'),
    ('student_account_links'),
    ('student_account_link_audit'),
    ('online_exams'),
    ('online_exam_items'),
    ('online_exam_attempts'),
    ('student_class_schedule'),
    ('student_learning_materials'),
    ('student_guardian_links'),
    ('student_guardian_link_audit'),
    ('platform_content_catalog'),
    ('trial_registrations')
),
public_tables as (
  select
    relation.relname as table_name,
    relation.relrowsecurity as row_level_security,
    relation.relforcerowsecurity as force_row_level_security,
    count(policy.oid)::integer as policy_count
  from pg_class as relation
  join pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  left join pg_policy as policy
    on policy.polrelid = relation.oid
  where namespace.nspname = 'public'
    and relation.relkind in ('r', 'p')
  group by
    relation.relname,
    relation.relrowsecurity,
    relation.relforcerowsecurity
),
chat_relations(name) as (
  values
    ('chat_conversations'),
    ('chat_messages'),
    ('chat_read_receipts'),
    ('chat_inbox'),
    ('chat_contacts'),
    ('chat_presence')
)
select jsonb_pretty(jsonb_build_object(
  'migration_ledger_present',
    to_regclass('supabase_migrations.schema_migrations') is not null,
  'missing_feature_relations',
    coalesce((
      select jsonb_agg(expected.name order by expected.name)
      from expected_feature_relations as expected
      where to_regclass('public.' || quote_ident(expected.name)) is null
    ), '[]'::jsonb),
  'feature_relation_presence',
    coalesce((
      select jsonb_object_agg(
        expected.name,
        to_regclass('public.' || quote_ident(expected.name)) is not null
        order by expected.name
      )
      from expected_feature_relations as expected
    ), '{}'::jsonb),
  'chat_relation_presence',
    coalesce((
      select jsonb_object_agg(
        chat.name,
        to_regclass('public.' || quote_ident(chat.name)) is not null
        order by chat.name
      )
      from chat_relations as chat
    ), '{}'::jsonb),
  'public_tables_without_rls',
    coalesce((
      select jsonb_agg(table_info.table_name order by table_info.table_name)
      from public_tables as table_info
      where not table_info.row_level_security
    ), '[]'::jsonb),
  'rls_tables_without_policies',
    coalesce((
      select jsonb_agg(table_info.table_name order by table_info.table_name)
      from public_tables as table_info
      where table_info.row_level_security
        and table_info.policy_count = 0
    ), '[]'::jsonb),
  'public_table_rls',
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'table', table_info.table_name,
        'row_level_security', table_info.row_level_security,
        'force_row_level_security', table_info.force_row_level_security,
        'policy_count', table_info.policy_count
      ) order by table_info.table_name)
      from public_tables as table_info
    ), '[]'::jsonb)
));

commit;
