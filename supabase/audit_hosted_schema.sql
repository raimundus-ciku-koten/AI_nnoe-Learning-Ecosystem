-- Read-only inventory for the hosted Supabase project.
-- Run in the Dashboard SQL Editor before reconciling or deploying migrations.
-- This reports schema metadata only; it does not read application rows or mutate state.

select
  'relation' as object_type,
  relation.table_name as object_name,
  jsonb_build_object(
    'relation_type', relation.table_type,
    'row_level_security', coalesce(class.relrowsecurity, false),
    'force_row_level_security', coalesce(class.relforcerowsecurity, false),
    'columns', coalesce(columns.column_definitions, '[]'::jsonb)
  ) as details
from information_schema.tables as relation
left join pg_namespace as namespace
  on namespace.nspname = relation.table_schema
left join pg_class as class
  on class.relnamespace = namespace.oid
  and class.relname = relation.table_name
left join lateral (
  select jsonb_agg(
    jsonb_build_object(
      'name', column_info.column_name,
      'type', column_info.data_type,
      'type_schema', column_info.udt_schema,
      'type_name', column_info.udt_name,
      'nullable', column_info.is_nullable = 'YES',
      'default', column_info.column_default,
      'identity', column_info.is_identity = 'YES',
      'generated', column_info.is_generated
    )
    order by column_info.ordinal_position
  ) as column_definitions
  from information_schema.columns as column_info
  where column_info.table_schema = relation.table_schema
    and column_info.table_name = relation.table_name
) as columns on true
where relation.table_schema = 'public'
  and relation.table_type in ('BASE TABLE', 'VIEW', 'FOREIGN')

union all

select
  'relation',
  namespace.nspname || '.' || relation.relname,
  jsonb_build_object(
    'relation_type', 'MATERIALIZED VIEW',
    'row_level_security', coalesce(relation.relrowsecurity, false),
    'force_row_level_security', coalesce(relation.relforcerowsecurity, false),
    'columns', coalesce(columns.column_definitions, '[]'::jsonb)
  )
from pg_class as relation
join pg_namespace as namespace
  on namespace.oid = relation.relnamespace
left join lateral (
  select jsonb_agg(
    jsonb_build_object(
      'name', column_info.column_name,
      'type', column_info.data_type,
      'type_schema', column_info.udt_schema,
      'type_name', column_info.udt_name,
      'nullable', column_info.is_nullable = 'YES',
      'default', column_info.column_default,
      'identity', column_info.is_identity = 'YES',
      'generated', column_info.is_generated
    )
    order by column_info.ordinal_position
  ) as column_definitions
  from information_schema.columns as column_info
  where column_info.table_schema = namespace.nspname
    and column_info.table_name = relation.relname
) as columns on true
where namespace.nspname = 'public'
  and relation.relkind = 'm'

union all

select
  'index',
  index_info.schemaname || '.' || index_info.tablename || '.' ||
    index_info.indexname,
  jsonb_build_object('definition', index_info.indexdef)
from pg_indexes as index_info
where index_info.schemaname = 'public'

union all

select
  'constraint',
  constraint_info.table_name || '.' || constraint_info.constraint_name,
  jsonb_build_object(
    'type', constraint_info.constraint_type,
    'definition', pg_get_constraintdef(constraint_data.oid),
    'validated', constraint_data.convalidated
  )
from information_schema.table_constraints as constraint_info
join pg_namespace as namespace
  on namespace.nspname = constraint_info.constraint_schema
join pg_class as relation
  on relation.relnamespace = namespace.oid
  and relation.relname = constraint_info.table_name
join pg_constraint as constraint_data
  on constraint_data.conrelid = relation.oid
  and constraint_data.conname = constraint_info.constraint_name
where constraint_info.constraint_schema = 'public'

union all

select
  'routine',
  routine_info.proname || '(' ||
    pg_get_function_identity_arguments(routine_info.oid) || ')',
  jsonb_build_object(
    'kind', routine_info.prokind,
    'identity_arguments', pg_get_function_identity_arguments(routine_info.oid),
    'security_definer', routine_info.prosecdef,
    'definition',
      case when routine_info.prokind in ('f', 'p')
        then pg_get_functiondef(routine_info.oid)
        else null
      end
  )
from pg_proc as routine_info
join pg_namespace as namespace
  on namespace.oid = routine_info.pronamespace
where namespace.nspname = 'public'
  and routine_info.prokind in ('f', 'p', 'a', 'w')

union all

select
  'policy',
  policy.schemaname || '.' || policy.tablename || '.' || policy.policyname,
  jsonb_build_object(
    'command', policy.cmd,
    'roles', policy.roles,
    'permissive', policy.permissive,
    'using', policy.qual,
    'with_check', policy.with_check
  )
from pg_policies as policy
where policy.schemaname = 'public'

union all

select
  'table_grant',
  relation.relname || '.' ||
    case when grant_info.grantee = 0 then 'PUBLIC'
         else pg_get_userbyid(grant_info.grantee) end || '.' ||
    grant_info.privilege_type,
  jsonb_build_object('grantable', grant_info.is_grantable)
from pg_class as relation
join pg_namespace as namespace
  on namespace.oid = relation.relnamespace
cross join lateral aclexplode(
  coalesce(relation.relacl, acldefault('r', relation.relowner))
) as grant_info
where namespace.nspname = 'public'
  and relation.relkind in ('r', 'p', 'v', 'm', 'f')

union all

select
  'column_grant',
  relation.relname || '.' || attribute.attname || '.' ||
    case when grant_info.grantee = 0 then 'PUBLIC'
         else pg_get_userbyid(grant_info.grantee) end || '.' ||
    grant_info.privilege_type,
  jsonb_build_object('grantable', grant_info.is_grantable)
from pg_class as relation
join pg_namespace as namespace
  on namespace.oid = relation.relnamespace
join pg_attribute as attribute
  on attribute.attrelid = relation.oid
cross join lateral aclexplode(
  attribute.attacl
) as grant_info
where namespace.nspname = 'public'
  and relation.relkind in ('r', 'p', 'v', 'm', 'f')
  and attribute.attnum > 0
  and not attribute.attisdropped

union all

select
  'sequence_grant',
  relation.relname || '.' ||
    case when grant_info.grantee = 0 then 'PUBLIC'
         else pg_get_userbyid(grant_info.grantee) end || '.' ||
    grant_info.privilege_type,
  jsonb_build_object('grantable', grant_info.is_grantable)
from pg_class as relation
join pg_namespace as namespace
  on namespace.oid = relation.relnamespace
cross join lateral aclexplode(
  coalesce(relation.relacl, acldefault('S', relation.relowner))
) as grant_info
where namespace.nspname = 'public'
  and relation.relkind = 'S'

union all

select
  'routine_grant',
  routine_info.proname || '(' ||
    pg_get_function_identity_arguments(routine_info.oid) || ').' ||
    case when grant_info.grantee = 0 then 'PUBLIC'
         else pg_get_userbyid(grant_info.grantee) end || '.' ||
    grant_info.privilege_type,
  jsonb_build_object('grantable', grant_info.is_grantable)
from pg_proc as routine_info
join pg_namespace as namespace
  on namespace.oid = routine_info.pronamespace
cross join lateral aclexplode(
  coalesce(routine_info.proacl, acldefault('f', routine_info.proowner))
) as grant_info
where namespace.nspname = 'public'

union all

select
  'schema_grant',
  namespace.nspname || '.' ||
    case when grant_info.grantee = 0 then 'PUBLIC'
         else pg_get_userbyid(grant_info.grantee) end || '.' ||
    grant_info.privilege_type,
  jsonb_build_object('grantable', grant_info.is_grantable)
from pg_namespace as namespace
cross join lateral aclexplode(
  coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))
) as grant_info
where namespace.nspname = 'public'

union all

select
  'default_grant',
  coalesce(namespace.nspname, 'ALL SCHEMAS') || '.' ||
    pg_get_userbyid(default_acl.defaclrole) || '.' ||
    default_acl.defaclobjtype::text || '.' ||
    case when grant_info.grantee = 0 then 'PUBLIC'
         else pg_get_userbyid(grant_info.grantee) end || '.' ||
    grant_info.privilege_type,
  jsonb_build_object('grantable', grant_info.is_grantable)
from pg_default_acl as default_acl
left join pg_namespace as namespace
  on namespace.oid = default_acl.defaclnamespace
cross join lateral aclexplode(default_acl.defaclacl) as grant_info
where default_acl.defaclnamespace = 0
   or namespace.nspname = 'public'

union all

select
  'type',
  namespace.nspname || '.' || type_info.typname,
  jsonb_build_object(
    'kind', type_info.typtype,
    'base_type',
      case when type_info.typtype = 'd'
        then format_type(type_info.typbasetype, type_info.typtypmod)
        else null
      end,
    'enum_values', enum_values.labels
  )
from pg_type as type_info
join pg_namespace as namespace
  on namespace.oid = type_info.typnamespace
left join lateral (
  select jsonb_agg(enum_info.enumlabel order by enum_info.enumsortorder) as labels
  from pg_enum as enum_info
  where enum_info.enumtypid = type_info.oid
) as enum_values on true
where namespace.nspname = 'public'
  and type_info.typtype in ('d', 'e', 'r', 'm')

union all

select
  'trigger',
  namespace.nspname || '.' || relation.relname || '.' || trigger_info.tgname,
  jsonb_build_object(
    'definition', pg_get_triggerdef(trigger_info.oid),
    'enabled', trigger_info.tgenabled,
    'function', function_info.proname,
    'function_schema', function_namespace.nspname
  )
from pg_trigger as trigger_info
join pg_class as relation
  on relation.oid = trigger_info.tgrelid
join pg_namespace as namespace
  on namespace.oid = relation.relnamespace
join pg_proc as function_info
  on function_info.oid = trigger_info.tgfoid
join pg_namespace as function_namespace
  on function_namespace.oid = function_info.pronamespace
where namespace.nspname in ('public', 'auth')
  and not trigger_info.tgisinternal

union all

select
  'migration_history',
  'supabase_migrations.schema_migrations',
  jsonb_build_object(
    'exists',
    to_regclass('supabase_migrations.schema_migrations') is not null,
    'columns',
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
    ), '[]'::jsonb)
  )

union all

select
  'feature_relation_presence',
  'expected_feature_tables',
  jsonb_object_agg(
    feature.name,
    to_regclass('public.' || feature.name) is not null
    order by feature.name
  )
from unnest(array[
  'attendance_records',
  'billing_plans',
  'chat_contacts',
  'chat_conversations',
  'chat_inbox',
  'chat_messages',
  'chat_presence',
  'chat_push_dispatches',
  'chat_read_receipts',
  'classroom_members',
  'drive_file_access',
  'drive_file_index',
  'drive_file_key_envelopes',
  'learning_classroom_assignments',
  'learning_classroom_attendance',
  'learning_classroom_attendance_sessions',
  'learning_classroom_journals',
  'learning_classroom_materials',
  'learning_classroom_quiz_questions',
  'learning_classroom_quiz_submissions',
  'learning_classroom_quizzes',
  'learning_classroom_report_card_audit',
  'learning_classroom_report_cards',
  'learning_classroom_submissions',
  'learning_classrooms',
  'learning_school_report_card_portfolio_audit',
  'learning_school_report_card_portfolios',
  'online_exam_attempts',
  'online_exam_items',
  'online_exams',
  'payment_orders',
  'personal_entitlements',
  'platform_audit',
  'platform_control',
  'platform_public_config',
  'private_workspace_records',
  'profiles',
  'question_bank',
  'school_access_index',
  'school_announcements',
  'school_letterheads',
  'security_audit',
  'student_account_link_audit',
  'student_account_links',
  'students',
  'tenant_entitlements',
  'tenants',
  'testimonial_submissions',
  'testimonials',
  'trial_registrations',
  'user_allowlist',
  'user_encryption_keys',
  'user_integration_consents',
  'user_menu_access',
  'web_push_subscriptions'
]) as feature(name)

order by object_type, object_name;
