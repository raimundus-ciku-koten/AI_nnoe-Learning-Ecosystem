import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const auditSql = await readFile(
  new URL('../../supabase/audit_staging_release_gate.sql', import.meta.url),
  'utf8',
);
const workflow = await readFile(
  new URL('../../.github/workflows/supabase-staging-schema-audit.yml', import.meta.url),
  'utf8',
);

test('Staging schema audit is read-only and reports role/chat/RLS release gates', () => {
  assert.match(auditSql, /^\s*begin read only;/i);
  assert.match(auditSql, /\bto_regclass\('supabase_migrations\.schema_migrations'\)/);
  assert.match(auditSql, /'missing_feature_relations'/);
  assert.match(auditSql, /'feature_relation_presence'/);
  assert.match(auditSql, /'chat_relation_presence'/);
  assert.match(auditSql, /'public_tables_without_rls'/);
  assert.match(auditSql, /'rls_tables_without_policies'/);
  assert.match(auditSql, /'public_table_rls'/);
  assert.match(auditSql, /'chat_presence'/);
  assert.match(auditSql, /'school_units'/);
  assert.match(auditSql, /'student_guardian_links'/);
  assert.match(auditSql, /'student_guardian_link_audit'/);
  assert.match(auditSql, /'online_exam_recipients'/);
  assert.match(auditSql, /'platform_content_catalog'/);
  assert.match(auditSql, /'trial_registrations'/);
  assert.match(auditSql, /\bcommit;\s*$/i);
  assert.doesNotMatch(
    auditSql,
    /^\s*(?:create|alter|drop|insert|update|delete|truncate|grant|revoke)\b/im,
  );
});

test('Staging audit workflow is manually triggered, target-pinned, and read-only', () => {
  assert.match(workflow, /^\s*workflow_dispatch:/m);
  assert.match(workflow, /GITHUB_REF.*refs\/heads\/main/);
  assert.match(workflow, /validateStagingBackupTarget\.mjs/);
  assert.match(workflow, /default_transaction_read_only=on/);
  assert.match(workflow, /audit_staging_release_gate\.sql/);
  assert.match(workflow, /retention-days: 1/);
  assert.doesNotMatch(workflow, /\bsupabase db push\b|\bdb reset\b/i);
});
