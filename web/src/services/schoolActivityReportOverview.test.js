import { afterEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../lib/supabase.ts', () => ({ supabase: { rpc } }));

import { muatRingkasanAktivitasLaporanSekolah } from './schoolActivityReportOverview.js';

describe('school activity report overview service', () => {
  afterEach(() => rpc.mockReset());

  it('accepts a complete set of nonnegative tenant aggregate metrics', async () => {
    rpc.mockResolvedValue({
      data: [
        { metric_key: 'classrooms_current', metric_value: 4 },
        { metric_key: 'lesson_journals_30d', metric_value: 12 },
        { metric_key: 'attendance_sessions_30d', metric_value: 9 },
        { metric_key: 'assignments_30d', metric_value: 7 },
        { metric_key: 'quizzes_30d', metric_value: 3 },
      ],
      error: null,
    });

    await expect(muatRingkasanAktivitasLaporanSekolah()).resolves.toMatchObject({
      classrooms_current: { label: 'Ruang kelas terdaftar', value: 4 },
      lesson_journals_30d: { value: 12 },
      attendance_sessions_30d: { value: 9 },
      assignments_30d: { value: 7 },
      quizzes_30d: { value: 3 },
    });
    expect(rpc).toHaveBeenCalledWith('school_admin_activity_report_overview');
  });

  it('rejects missing, duplicate, negative, or unsafe metrics', async () => {
    for (const data of [
      [{ metric_key: 'classrooms_current', metric_value: 1 }],
      Array.from({ length: 5 }, () => ({ metric_key: 'classrooms_current', metric_value: 1 })),
      [
        { metric_key: 'classrooms_current', metric_value: 1 },
        { metric_key: 'lesson_journals_30d', metric_value: -1 },
        { metric_key: 'attendance_sessions_30d', metric_value: 0 },
        { metric_key: 'assignments_30d', metric_value: 0 },
        { metric_key: 'quizzes_30d', metric_value: 0 },
      ],
    ]) {
      rpc.mockResolvedValueOnce({ data, error: null });
      await expect(muatRingkasanAktivitasLaporanSekolah())
        .rejects.toThrow('ringkasan aktivitas sekolah yang tidak valid');
    }
  });

  it('surfaces RPC authorization and server failures', async () => {
    const serverError = new Error('permission denied');
    rpc.mockResolvedValue({ data: null, error: serverError });
    await expect(muatRingkasanAktivitasLaporanSekolah()).rejects.toBe(serverError);
  });
});
