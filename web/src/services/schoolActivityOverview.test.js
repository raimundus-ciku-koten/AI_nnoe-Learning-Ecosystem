import { afterEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../lib/supabase.ts', () => ({ supabase: { rpc } }));

import {
  muatAktivitasTerbaruSekolah,
  muatRingkasanChatSekolah,
} from './schoolActivityOverview.js';

describe('school activity overview service', () => {
  afterEach(() => rpc.mockReset());

  it('accepts only known, content-free activity labels with valid timestamps', async () => {
    rpc.mockResolvedValue({
      data: [{
        event_key: 'online_exam',
        event_label: 'Ujian online dijadwalkan',
        occurred_at: '2026-10-25T01:00:00Z',
      }],
      error: null,
    });
    await expect(muatAktivitasTerbaruSekolah()).resolves.toHaveLength(1);
    expect(rpc).toHaveBeenCalledWith('school_admin_recent_activity');

    rpc.mockResolvedValueOnce({
      data: [{
        event_key: 'online_exam',
        event_label: 'Exam answer: secret content',
        occurred_at: '2026-10-25T01:00:00Z',
      }],
      error: null,
    });
    await expect(muatAktivitasTerbaruSekolah()).rejects.toThrow(
      'Server mengembalikan aktivitas tenant yang tidak valid.',
    );
  });

  it('validates aggregate metrics and surfaces RPC errors', async () => {
    rpc.mockResolvedValue({
      data: [
        { metric_key: 'conversations_created_30d', metric_value: 2 },
        { metric_key: 'messages_7d', metric_value: 8 },
        { metric_key: 'active_senders_30d', metric_value: 3 },
      ],
      error: null,
    });
    await expect(muatRingkasanChatSekolah()).resolves.toEqual({
      conversations_created_30d: 2,
      messages_7d: 8,
      active_senders_30d: 3,
    });

    rpc.mockResolvedValueOnce({
      data: [{ metric_key: 'messages_7d', metric_value: -1 }],
      error: null,
    });
    await expect(muatRingkasanChatSekolah()).rejects.toThrow(
      'Server mengembalikan ringkasan chat tenant yang tidak valid.',
    );

    const serverError = new Error('permission denied');
    rpc.mockResolvedValueOnce({ data: null, error: serverError });
    await expect(muatRingkasanChatSekolah()).rejects.toBe(serverError);
  });
});
