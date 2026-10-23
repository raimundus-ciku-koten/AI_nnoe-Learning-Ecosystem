import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabase } = vi.hoisted(() => ({ supabase: { rpc: vi.fn() } }));
vi.mock('../lib/supabase.ts', () => ({ supabase }));

import { muatLaporanPresensi } from './attendanceReports.js';

const row = {
  id: 'attendance-a',
  student_id: 'student-a',
  student_name: 'Siswa A',
  class_name: '7A',
  attendance_date: '2026-10-23',
  attendance_status: 'hadir',
  recorded_at: '2026-10-23T01:00:00.000Z',
};

describe('attendance report service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requests role-scoped, filtered server pages and maps the approved fields', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: [row], error: null });
    await expect(muatLaporanPresensi({
      date: '2026-10-23',
      className: '7A',
      search: 'Siswa',
      limit: 50,
      offset: 100,
    })).resolves.toEqual([{
      id: row.id,
      studentId: row.student_id,
      name: row.student_name,
      className: row.class_name,
      date: row.attendance_date,
      status: row.attendance_status,
      recordedAt: row.recorded_at,
    }]);
    expect(supabase.rpc).toHaveBeenCalledWith('school_attendance_report', {
      p_attendance_date: '2026-10-23',
      p_class_name: '7A',
      p_student_search: 'Siswa',
      p_limit: 50,
      p_offset: 100,
    });
  });

  it('rejects invalid date, paging, class, and search filters before calling the server', async () => {
    await expect(muatLaporanPresensi({ date: '2026-02-30' })).rejects.toThrow('Tanggal');
    await expect(muatLaporanPresensi({ date: 0 })).rejects.toThrow('Tanggal');
    await expect(muatLaporanPresensi({ limit: 201 })).rejects.toThrow('Batas');
    await expect(muatLaporanPresensi({ offset: -1 })).rejects.toThrow('Posisi');
    await expect(muatLaporanPresensi({ className: ' 7A' })).rejects.toThrow('kelas');
    await expect(muatLaporanPresensi({ search: 'x'.repeat(101) })).rejects.toThrow('Pencarian');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('surfaces backend failures and rejects malformed report rows', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: new Error('denied') });
    await expect(muatLaporanPresensi()).rejects.toThrow('denied');

    supabase.rpc.mockResolvedValueOnce({ data: [{ ...row, student_name: null }], error: null });
    await expect(muatLaporanPresensi()).rejects.toThrow('tidak valid');
  });
});
