import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';

const migrationsDirectory = new URL('../supabase/migrations/', import.meta.url);

test('hosted schema audit lists every public table and view created by migrations', async () => {
  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith('.sql'));
  const migrationSources = await Promise.all(
    migrationFiles.map((file) => readFile(new URL(file, migrationsDirectory), 'utf8')),
  );
  const createdRelations = new Set();

  for (const source of migrationSources) {
    for (const match of source.matchAll(
      /\bcreate\s+(?:table(?:\s+if\s+not\s+exists)?|(?:or\s+replace\s+)?view)\s+public\.([a-z0-9_]+)/gi,
    )) {
      createdRelations.add(match[1]);
    }
  }

  const audit = await readFile(
    new URL('../supabase/audit_hosted_schema.sql', import.meta.url),
    'utf8',
  );
  const expectedRelations = audit.match(
    /from unnest\(array\[([\s\S]*?)\]\) as feature\(name\)/,
  )?.[1];

  assert.ok(expectedRelations, 'audit must declare its expected public relations');
  const auditedRelations = new Set(
    [...expectedRelations.matchAll(/'([a-z0-9_]+)'/g)].map((match) => match[1]),
  );
  assert.deepEqual(
    [...auditedRelations].sort(),
    [...createdRelations].sort(),
    'audit relation inventory should stay aligned with migration-created public tables and views',
  );
  assert.match(audit, /information_schema\.columns/);
  assert.match(audit, /table_schema = 'supabase_migrations'/);
  assert.match(audit, /table_name = 'schema_migrations'/);
});
