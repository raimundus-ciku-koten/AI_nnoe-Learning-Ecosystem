import { describe, expect, it } from 'vitest';

import { buatEventAuditJurnal } from './lessonJournalAudit.js';

const journalId = '00000000-0000-4000-8000-000000000001';

describe('metadata-only lesson journal audit events', () => {
  it('creates an event with an idempotency ID and field names, never journal contents', () => {
    const event = buatEventAuditJurnal({
      journalId,
      action: 'updated',
      changedFields: ['materi', 'status'],
      occurredAt: '2026-10-18T10:00:00.000Z',
    });

    expect(event).toMatchObject({
      journalId,
      action: 'updated',
      changedFields: ['materi', 'status'],
      occurredAt: '2026-10-18T10:00:00.000Z',
    });
    expect(event.eventId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(Object.keys(event).sort()).toEqual([
      'action', 'changedFields', 'eventId', 'journalId', 'occurredAt',
    ]);
  });

  it('rejects invalid IDs, actions, changed fields, and timestamps', () => {
    expect(() => buatEventAuditJurnal({
      journalId: 'not-a-uuid',
      action: 'created',
      changedFields: ['materi'],
    })).toThrow('Identitas atau aksi');
    expect(() => buatEventAuditJurnal({
      journalId,
      action: 'read',
      changedFields: ['materi'],
    })).toThrow('Identitas atau aksi');
    expect(() => buatEventAuditJurnal({
      journalId,
      action: 'updated',
      changedFields: ['isiRahasia'],
    })).toThrow('Daftar field');
    expect(() => buatEventAuditJurnal({
      journalId,
      action: 'updated',
      changedFields: ['materi'],
      occurredAt: 'yesterday',
    })).toThrow('Waktu audit');
  });
});
