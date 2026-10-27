-- Read-only release-gate summary for Supabase Dashboard SQL Editor.
-- Reports relation names, RLS status, and migration-ledger metadata only.
-- Does not read application rows or routine definitions.

with expected(name) as (
  values
    ('attendance_records'),
    ('billing_plans'),
    ('chat_contacts'),
    ('chat_conversations'),
    ('chat_inbox'),
    ('chat_messages'),
    ('chat_presence'),
    ('chat_push_dispatches'),
    ('chat_read_receipts'),
    ('classroom_members'),
    ('classroom_rubric_versions'),
    ('classroom_rubrics'),
    ('drive_file_access'),
    ('drive_file_index'),
    ('drive_file_key_envelopes'),
    ('learning_classroom_assignments'),
    ('learning_classroom_attendance'),
    ('learning_classroom_attendance_sessions'),
    ('learning_classroom_homerooms'),
    ('learning_classroom_journals'),
    ('learning_classroom_materials'),
    ('learning_classroom_schedules'),
    ('learning_classroom_quiz_questions'),
    ('learning_classroom_quiz_submissions'),
    ('learning_classroom_quizzes'),
    ('learning_classroom_report_card_audit'),
    ('learning_classroom_report_cards'),
    ('learning_classroom_submissions'),
    ('learning_classrooms'),
    ('learning_school_report_card_portfolio_audit'),
    ('learning_school_report_card_portfolios'),
    ('online_exam_attempts'),
    ('online_exam_items'),
    ('online_exams'),
    ('payment_orders'),
    ('personal_entitlements'),
    ('platform_audit'),
    ('platform_control'),
    ('platform_public_config'),
    ('private_workspace_records'),
    ('profiles'),
    ('question_bank'),
    ('school_access_index'),
    ('school_announcements'),
    ('school_letterheads'),
    ('security_audit'),
    ('student_account_link_audit'),
    ('student_account_links'),
    ('student_guardian_link_audit'),
    ('student_guardian_links'),
    ('students'),
    ('tenant_entitlements'),
    ('tenants'),
    ('testimonial_submissions'),
    ('testimonials'),
    ('trial_registrations'),
    ('user_allowlist'),
    ('user_encryption_keys'),
    ('user_integration_consents'),
    ('user_menu_access'),
    ('web_push_subscriptions')
),
relation_status as (
  select
    expected.name,
    relation.oid is not null as present,
    coalesce(relation.relrowsecurity, false) as row_level_security,
    coalesce(relation.relforcerowsecurity, false) as force_row_level_security,
    relation.relkind
  from expected
  left join pg_namespace as namespace
    on namespace.nspname = 'public'
  left join pg_class as relation
    on relation.relnamespace = namespace.oid
    and relation.relname = expected.name
    and relation.relkind in ('r', 'p', 'v', 'm', 'f')
),
ledger as (
  select
    to_regclass('supabase_migrations.schema_migrations') is not null as history_table_present,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'name', column_info.column_name,
          'type', column_info.data_type,
          'nullable', column_info.is_nullable = 'YES'
        )
        order by column_info.ordinal_position
      )
      from information_schema.columns as column_info
      where column_info.table_schema = 'supabase_migrations'
        and column_info.table_name = 'schema_migrations'
    ), '[]'::jsonb) as columns
)
select jsonb_pretty(jsonb_build_object(
  'expected_feature_relation_count', (
    select count(*) from relation_status
  ),
  'present_feature_relation_count', (
    select count(*) from relation_status where present
  ),
  'missing_feature_relations', coalesce((
    select jsonb_agg(name order by name)
    from relation_status
    where not present
  ), '[]'::jsonb),
  'relations_with_rls_disabled', coalesce((
    select jsonb_agg(name order by name)
    from relation_status
    where present
      and relkind in ('r', 'p')
      and not row_level_security
  ), '[]'::jsonb),
  'relations_without_forced_rls', coalesce((
    select jsonb_agg(name order by name)
    from relation_status
    where present
      and relkind in ('r', 'p')
      and not force_row_level_security
  ), '[]'::jsonb),
  'migration_history_exists', ledger.history_table_present,
  'migration_history_columns', ledger.columns
))
from ledger;

-- Only if migration_history_exists is true, run this separately to list the
-- recorded versions. It reads schema history, not application data:
-- select version::text
-- from supabase_migrations.schema_migrations
-- order by version;
