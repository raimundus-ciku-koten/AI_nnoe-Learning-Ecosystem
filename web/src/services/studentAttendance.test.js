import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabase } = vi.hoisted(() => ({ supabase: { rpc: vi.fn() } }));
vi.mock('../lib/supabase.ts', () => ({ supabase }));

import {
  muatRiwayatKehadiranSiswa,
  ringkasKehadiranSiswa,
} from './studentAttendance.js';

describe('student attendance service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads attendance only from the student-specific server RPC', async () => {
    supabase.rpc.mockResolvedValueOnce({
      data: [{
        attendance_date: '2026-10-23',
        attendance_status: 'hadir',
        recorded_at: '2026-10-23T01:00:00.000Z',
        class_name: '7A',
      }],
      error: null,
    });
    await expect(muatRiwayatKehadiranSiswa()).resolves.toEqual([{
      date: '2026-10-23',
      status: 'hadir',
      recordedAt: '2026-10-23T01:00:00.000Z',
      className: '7A',
    }]);
    expect(supabase.rpc).toHaveBeenCalledWith('student_attendance_history');

    supabase.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(muatRiwayatKehadiranSiswa()).rejects.toThrow('tidak valid');

    supabase.rpc.mockResolvedValueOnce({ data: null, error: new Error('denied') });
    await expect(muatRiwayatKehadiranSiswa()).rejects.toThrow('denied');
  });

  it('summarizes the newest attendance record and preserves the loaded count', () => {
    expect(ringkasKehadiranSiswa([
      { date: '2026-10-22', recordedAt: '2026-10-22T08:00:00Z', status: 'hadir', className: '7A' },
      { date: '2026-10-23', recordedAt: '2026-10-23T07:00:00Z', status: 'hadir', className: '7A' },
    ])).toEqual({
      recordCount: 2,
      latest: { date: '2026-10-23', recordedAt: '2026-10-23T07:00:00Z', status: 'hadir', className: '7A' },
    });
    expect(ringkasKehadiranSiswa([])).toEqual({ recordCount: 0, latest: null });
    expect(() => ringkasKehadiranSiswa(null)).toThrow('tidak valid');
  });
});
