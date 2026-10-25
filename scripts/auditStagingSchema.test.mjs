import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  auditStagingSchema,
  buildSchemaAuditQuery,
  getExpectedRelationNames,
  renderSchemaAuditSummary,
} from './auditStagingSchema.mjs';

const auditSql = await readFile(
  new URL('../supabase/audit_hosted_schema.sql', import.meta.url),
  'utf8',
);

test('builds a read-only inventory query from the audited relation list', () => {
  const names = getExpectedRelationNames(auditSql);
  const query = buildSchemaAuditQuery(names);

  assert.ok(names.includes('learning_classrooms'));
  assert.match(query, /to_regclass\('public\.' \|\| relation\.name\)/);
  assert.match(query, /to_regclass\('supabase_migrations\.schema_migrations'\)/);
  assert.doesNotMatch(query, /\b(insert|update|delete|alter|drop|grant|revoke|truncate)\b/i);
});

test('reports missing feature relations and migration history without exposing connection details', async () => {
  let executedQuery = '';
  const summary = await auditStagingSchema({
    connectionString: 'postgresql://postgres.samszhfyhbjuculrcffg:secret@aws-0-ap-south-1.pooler.supabase.com:5432/postgres',
    auditSql,
    runPsql: (_command, args) => {
      executedQuery = args.at(-1);
      return {
        status: 0,
        stdout: JSON.stringify({
          relations: { learning_classrooms: false, students: true },
          migration_history_exists: false,
        }),
      };
    },
  });

  assert.match(summary, /Expected feature relations present: 1\/2/);
  assert.match(summary, /migration history table: not found/);
  assert.match(summary, /Missing public relations: learning_classrooms/);
  assert.doesNotMatch(summary, /secret|postgresql:\/\//i);
  assert.match(executedQuery, /learning_classrooms/);
});

test('rejects non-Staging URLs before invoking psql', async () => {
  let invoked = false;
  await assert.rejects(
    auditStagingSchema({
      connectionString: 'postgresql://postgres.jvcrmzmuxgyuetkjqady:secret@db.jvcrmzmuxgyuetkjqady.supabase.co:5432/postgres',
      auditSql,
      runPsql: () => {
        invoked = true;
        return { status: 0, stdout: '{}' };
      },
    }),
    /configured Staging database only/,
  );
  assert.equal(invoked, false);
});

test('rejects malformed or failed psql reports explicitly', () => {
  assert.throws(
    () => renderSchemaAuditSummary({ relations: [], migration_history_exists: false }),
    /invalid relations report/,
  );
});
