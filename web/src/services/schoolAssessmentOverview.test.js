import { afterEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../lib/supabase.ts', () => ({ supabase: { rpc } }));

import { muatRingkasanAsesmenSekolah } from './schoolAssessmentOverview.js';

const row = {
  exam_id: 'exam-1',
  title: 'Asesmen Matematika',
  kelas: 'VII A',
  starts_at: '2026-10-25T01:00:00Z',
  ends_at: '2026-10-25T02:00:00Z',
  duration_minutes: 60,
  status: 'active',
  question_count: 20,
  participant_count: 25,
  submitted_count: 20,
  pending_review_count: 2,
};

describe('school assessment overview service', () => {
  afterEach(() => rpc.mockReset());

  it('loads aggregate assessment data through the tenant-scoped server RPC', async () => {
    rpc.mockResolvedValue({ data: [row], error: null });
    await expect(muatRingkasanAsesmenSekolah()).resolves.toEqual([row]);
    expect(rpc).toHaveBeenCalledWith('school_admin_online_exam_overview');
  });

  it('surfaces server errors and rejects malformed rows', async () => {
    const serverError = new Error('permission denied');
    rpc.mockResolvedValueOnce({ data: null, error: serverError });
    await expect(muatRingkasanAsesmenSekolah()).rejects.toBe(serverError);

    rpc.mockResolvedValueOnce({ data: [{ ...row, participant_count: -1 }], error: null });
    await expect(muatRingkasanAsesmenSekolah()).rejects.toThrow(
      'Server mengembalikan ringkasan asesmen yang tidak valid.',
    );
  });
});
