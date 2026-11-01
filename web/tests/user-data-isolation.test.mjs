import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';

const migrationDirectory = new URL('../../supabase/migrations/', import.meta.url);
const migrationFiles = (await readdir(migrationDirectory)).filter((file) => file.endsWith('.sql'));
const migrations = await Promise.all(migrationFiles.map((file) => (
  readFile(new URL(file, migrationDirectory), 'utf8')
)));
const allMigrations = migrations.join('\n');

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('every public table created by a migration enables row-level security', () => {
  const relations = [...allMigrations.matchAll(
    /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)/gi,
  )].map((match) => match[1].toLowerCase());
  assert.ok(relations.length > 0, 'Expected application tables in Supabase migrations.');

  for (const relation of new Set(relations)) {
    const table = escapeRegex(relation);
    assert.match(
      allMigrations,
      new RegExp(`\\balter\\s+table\\s+(?:if\\s+exists\\s+)?public\\.${table}\\s+enable\\s+row\\s+level\\s+security\\b`, 'i'),
      `${relation} must enable RLS`,
    );
  }
});

test('private classroom records enforce authenticated ownership on writes', () => {
  for (const relation of ['students', 'attendance_records', 'lesson_journals', 'question_bank']) {
    const migration = migrations.find((source) => new RegExp(
      `\\bcreate\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?public\\.${relation}\\b`,
      'i',
    ).test(source));
    assert.ok(migration, `Expected migration for ${relation}.`);
    assert.match(
      migration,
      /owner_id\s*=\s*\(select auth\.uid\(\)\)/i,
      `${relation} must bind user-owned records to the signed-in UID`,
    );
  }
});

test('offline drafts, sync queues, and AI settings are namespaced by user account', async () => {
  const [journalPage, offlineSync, auditQueue, aiSettings] = await Promise.all([
    readFile(new URL('../src/pages/LessonJournalPage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/offlineSync.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/lessonJournalAudit.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/aiProviders.js', import.meta.url), 'utf8'),
  ]);
  assert.match(journalPage, /lesson-journal:draft:v1:\$\{tenantId\}:\$\{ownerUid\}/);
  assert.match(offlineSync, /return `\$\{DATABASE_NAME\}-\$\{ownerId\}`/);
  assert.match(auditQueue, /databaseName\(userId\)/);
  assert.match(aiSettings, /LOCAL_SETTINGS_KEY\}:\$\{encodeURIComponent\(requireUser\(uid\)\)\}/);
});
