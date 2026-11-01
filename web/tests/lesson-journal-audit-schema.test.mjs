import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const migration = await readFile(new URL(
  '../../supabase/migrations/20261103000200_journal_audit_outbox.sql',
  import.meta.url,
), 'utf8');
const vercel = JSON.parse(await readFile(new URL('../../vercel.json', import.meta.url), 'utf8'));

test('audit outbox stores only event metadata and is inaccessible to browser roles', () => {
  assert.match(migration, /create table if not exists public\.lesson_journal_audit_outbox/);
  assert.match(migration, /unique \(user_id, event_id\)/);
  assert.match(migration, /changed_fields text\[\]/);
  assert.match(migration, /status in \('pending', 'delivered', 'expired'\)/);
  assert.match(migration, /alter table public\.lesson_journal_audit_outbox enable row level security/);
  assert.match(migration, /revoke all on table public\.lesson_journal_audit_outbox from public, anon, authenticated/);
  assert.match(migration, /grant all on table public\.lesson_journal_audit_outbox to service_role/);
  assert.doesNotMatch(migration, /nilai_lama|nilai_baru|materi text|kegiatan text/);
});

test('Vercel schedules daily delivery and one-year audit cleanup', () => {
  assert.deepEqual(vercel.crons, [{
    path: '/api/cron/lesson-journal-audit',
    schedule: '17 3 * * *',
  }]);
});
