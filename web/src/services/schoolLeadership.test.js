import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabase = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../lib/supabase.ts', () => ({ supabase }));

import {
  muatKandidatWaliKelas,
  muatKelasWali,
  muatLaporanKelasWali,
  muatPenugasanWaliKelas,
  muatRingkasanKepalaSekolah,
  tetapkanWaliKelas,
} from './schoolLeadership.js';

describe('school leadership service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps the single aggregate principal response', async () => {
    supabase.rpc.mockResolvedValue({
      data: [{
        classroom_count: 3,
        student_count: 42,
        attendance_records: 76,
        attendance_rate: 91.2,
        graded_submissions: 28,
        assignment_average: 82.5,
        quiz_submissions: 17,
        quiz_average: 79.4,
      }],
      error: null,
    });

    await expect(muatRingkasanKepalaSekolah()).resolves.toEqual({
      jumlahKelas: 3,
      jumlahSiswa: 42,
      jumlahCatatanPresensi: 76,
      persentaseHadir: 91.2,
      pengumpulanDinilai: 28,
      rataNilaiTugas: 82.5,
      kuisDikerjakan: 17,
      rataNilaiKuis: 79.4,
    });
    expect(supabase.rpc).toHaveBeenCalledWith('learning_school_principal_summary');
  });

  it('validates class and per-student summary rows', async () => {
    supabase.rpc
      .mockResolvedValueOnce({
        data: [{
          classroom_id: 'class-1',
          classroom_name: 'X-A',
          grade: 'X',
          academic_year: '2026/2027',
        }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{
          student_id: 'student-1',
          student_name: 'Siswa Satu',
          attendance_sessions: 2,
          hadir: 1,
          izin: 1,
          sakit: 0,
          alpa: 0,
          graded_assignments: 1,
          assignment_average: 87,
          completed_quizzes: 1,
          quiz_average: 91,
        }],
        error: null,
      });

    const classes = await muatKelasWali();
    expect(classes).toEqual([{
      id: 'class-1',
      nama: 'X-A',
      tingkat: 'X',
      tahunAjaran: '2026/2027',
    }]);
    await expect(muatLaporanKelasWali('class-1')).resolves.toEqual([{
      id: 'student-1',
      nama: 'Siswa Satu',
      presensi: { sesi: 2, hadir: 1, izin: 1, sakit: 0, alpa: 0 },
      tugasDinilai: 1,
      rataNilaiTugas: 87,
      kuisDikerjakan: 1,
      rataNilaiKuis: 91,
    }]);
    expect(supabase.rpc).toHaveBeenLastCalledWith('learning_classroom_homeroom_report', {
      p_classroom_id: 'class-1',
    });
  });

  it('loads tenant assignment data and permits clearing only with a valid class id', async () => {
    supabase.rpc
      .mockResolvedValueOnce({ data: [{ id: 'wali-1', nama: 'Wali Satu' }], error: null })
      .mockResolvedValueOnce({
        data: [{
          classroom_id: 'class-1',
          classroom_name: 'X-A',
          grade: 'X',
          academic_year: '2026/2027',
          homeroom_user_id: 'wali-1',
          homeroom_name: 'Wali Satu',
        }],
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });

    await expect(muatKandidatWaliKelas('school-1')).resolves.toEqual([
      { id: 'wali-1', nama: 'Wali Satu' },
    ]);
    await expect(muatPenugasanWaliKelas('school-1')).resolves.toEqual([{
      id: 'class-1',
      nama: 'X-A',
      tingkat: 'X',
      tahunAjaran: '2026/2027',
      waliId: 'wali-1',
      waliNama: 'Wali Satu',
    }]);
    await expect(tetapkanWaliKelas('class-1', null)).resolves.toBeUndefined();
    expect(supabase.rpc).toHaveBeenLastCalledWith('assign_learning_classroom_homeroom', {
      p_classroom_id: 'class-1',
      p_user_id: null,
    });
  });

  it('does not conceal backend or malformed-response errors', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: new Error('permission denied') });
    await expect(muatKelasWali()).rejects.toThrow('permission denied');

    supabase.rpc.mockResolvedValueOnce({
      data: [{ classroom_count: -1 }],
      error: null,
    });
    await expect(muatRingkasanKepalaSekolah()).rejects.toThrow('ringkasan sekolah yang tidak valid');

    supabase.rpc.mockResolvedValueOnce({
      data: [{
        classroom_count: 1,
        student_count: 4,
        attendance_records: 3,
        attendance_rate: 120,
        graded_submissions: 0,
        assignment_average: null,
        quiz_submissions: 0,
        quiz_average: null,
      }],
      error: null,
    });
    await expect(muatRingkasanKepalaSekolah()).rejects.toThrow('ringkasan sekolah yang tidak valid');

    await expect(muatLaporanKelasWali('')).rejects.toThrow('Pilih kelas');
    await expect(muatKandidatWaliKelas('')).rejects.toThrow('Sekolah aktif');
    await expect(tetapkanWaliKelas('', null)).rejects.toThrow('Kelas atau akun wali');
  });
});
