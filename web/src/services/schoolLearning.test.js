import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabase } = vi.hoisted(() => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock('../lib/supabase.ts', () => ({ supabase }));

import {
  beriUmpanBalikTugas,
  buatJadwalMateri,
  hapusJadwalMateri,
  kirimJawabanTugas,
  muatPengumpulanTugasStaf,
  muatPengumpulanTugasSiswa,
  muatKelasRosterGuru,
  muatJadwalMateriStaf,
  muatJadwalMateriSiswa,
  ringkasBelajarSiswa,
  ubahJadwalMateri,
} from './schoolLearning.js';

const row = {
  id: 'learning-1',
  tenant_id: 'school-a',
  author_id: 'teacher-a',
  class_name: '7A',
  kind: 'schedule',
  title: 'Matematika',
  body: 'Bab bilangan.',
  starts_at: '2026-10-24T01:00:00.000Z',
  due_at: null,
  published: true,
  created_at: '2026-10-23T10:00:00.000Z',
  updated_at: '2026-10-23T10:00:00.000Z',
};

function builder(result) {
  const query = {};
  for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'order']) {
    query[method] = vi.fn(() => query);
  }
  query.limit = vi.fn(() => Promise.resolve(result));
  query.single = vi.fn(() => Promise.resolve(result));
  query.maybeSingle = vi.fn(() => Promise.resolve(result));
  return query;
}

describe('school learning service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads staff content within the requested tenant and rejects malformed server rows', async () => {
    const query = builder({ data: [row], error: null });
    supabase.from.mockReturnValueOnce(query);
    await expect(muatJadwalMateriStaf(' school-a ')).resolves.toMatchObject([
      { id: row.id, className: '7A', kind: 'schedule', published: true },
    ]);
    expect(query.eq).toHaveBeenCalledWith('tenant_id', 'school-a');
    expect(query.limit).toHaveBeenCalledWith(300);

    const invalid = builder({ data: [{ ...row, kind: 'unknown' }], error: null });
    supabase.from.mockReturnValueOnce(invalid);
    await expect(muatJadwalMateriStaf('school-a')).rejects.toThrow('tidak valid');
  });

  it('reads student data only from the server-validated feed RPC', async () => {
    const { tenant_id: _tenant, author_id: _author, ...studentRow } = row;
    supabase.rpc.mockResolvedValueOnce({ data: [studentRow], error: null });
    await expect(muatJadwalMateriSiswa()).resolves.toMatchObject([
      { id: row.id, className: '7A', published: true },
    ]);
    expect(supabase.rpc).toHaveBeenCalledWith('student_learning_feed');
    expect(supabase.from).not.toHaveBeenCalled();

    supabase.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(muatJadwalMateriSiswa()).rejects.toThrow('tidak valid');
  });

  it('summarizes upcoming schedules and tasks not yet submitted', () => {
    const summary = ringkasBelajarSiswa([
      { ...row, kind: 'schedule', id: 'later', startsAt: '2026-10-25T08:00:00.000Z' },
      { ...row, kind: 'schedule', id: 'past', startsAt: '2026-10-22T08:00:00.000Z' },
      { ...row, kind: 'task', id: 'submitted', dueAt: '2026-10-24T08:00:00.000Z' },
      { ...row, kind: 'task', id: 'pending-later', dueAt: '2026-10-26T08:00:00.000Z' },
      { ...row, kind: 'task', id: 'pending-soon', dueAt: '2026-10-24T08:00:00.000Z' },
      { ...row, kind: 'task', id: 'overdue', dueAt: '2026-10-22T08:00:00.000Z' },
    ], [{ taskId: 'submitted' }], new Date('2026-10-23T08:00:00.000Z'));

    expect(summary).toMatchObject({
      scheduleCount: 1,
      schedules: [{ id: 'later' }],
      pendingTaskCount: 3,
      pendingTasks: [
        { id: 'overdue', overdue: true },
        { id: 'pending-soon', overdue: false },
        { id: 'pending-later', overdue: false },
      ],
      overdueTaskCount: 1,
    });
  });

  it('limits dashboard detail rows while preserving their total counts', () => {
    const items = Array.from({ length: 7 }, (_, index) => ({
      ...row,
      id: `schedule-${index}`,
      kind: 'schedule',
      startsAt: `2026-10-${String(24 + index).padStart(2, '0')}T08:00:00.000Z`,
    }));
    const summary = ringkasBelajarSiswa(items, [], new Date('2026-10-23T08:00:00.000Z'));
    expect(summary.scheduleCount).toBe(7);
    expect(summary.schedules).toHaveLength(5);
  });

  it('rejects invalid dashboard summary inputs', () => {
    expect(() => ringkasBelajarSiswa(null, [])).toThrow('tidak valid');
    expect(() => ringkasBelajarSiswa([], [], 'not-a-time')).toThrow('Waktu');
  });

  it('returns only distinct class names from the authenticated teacher roster query', async () => {
    const query = builder({ data: [{ kelas: '7A' }, { kelas: '7B' }, { kelas: '7A' }], error: null });
    supabase.from.mockReturnValueOnce(query);
    await expect(muatKelasRosterGuru('school-a', 'teacher-a')).resolves.toEqual(['7A', '7B']);
    expect(supabase.from).toHaveBeenCalledWith('students');
    expect(query.select).toHaveBeenCalledWith('kelas');
    expect(query.eq.mock.calls).toEqual([
      ['tenant_id', 'school-a'],
      ['owner_id', 'teacher-a'],
    ]);
    expect(query.limit).toHaveBeenCalledWith(2000);
  });

  it('validates fields, date requirements, and ordering before writing', async () => {
    await expect(buatJadwalMateri('', 'teacher-a', {
      kind: 'schedule', className: '7A', title: 'Kegiatan', body: 'Isi',
      startsAt: '2026-10-24T08:00', published: true,
    })).rejects.toThrow('sekolah');
    await expect(buatJadwalMateri('school-a', 'teacher-a', {
      kind: 'schedule', className: '7A', title: 'Kegiatan', body: 'Isi',
      startsAt: '', published: true,
    })).rejects.toThrow('Waktu jadwal');
    await expect(buatJadwalMateri('school-a', 'teacher-a', {
      kind: 'task', className: '7A', title: 'Tugas', body: 'Isi',
      dueAt: '', published: true,
    })).rejects.toThrow('Tenggat');
    await expect(buatJadwalMateri('school-a', 'teacher-a', {
      kind: 'schedule', className: '7A', title: 'Kegiatan', body: 'Isi',
      startsAt: '2026-10-25T08:00', dueAt: '2026-10-24T08:00', published: true,
    })).rejects.toThrow('sebelum');
    expect(supabase.from).not.toHaveBeenCalled();

    const query = builder({ data: row, error: null });
    supabase.from.mockReturnValueOnce(query);
    await expect(buatJadwalMateri('school-a', 'teacher-a', {
      kind: 'schedule', className: ' 7A ', title: ' Matematika ',
      body: ' Bab bilangan.\nLatihan halaman 12. ', startsAt: '2026-10-24T01:00:00.000Z', published: true,
    })).resolves.toMatchObject({ id: row.id, className: '7A' });
    expect(query.insert).toHaveBeenCalledWith({
      tenant_id: 'school-a',
      author_id: 'teacher-a',
      class_name: '7A',
      kind: 'schedule',
      title: 'Matematika',
      body: 'Bab bilangan.\nLatihan halaman 12.',
      starts_at: row.starts_at,
      due_at: null,
      published: true,
    });
  });

  it('tenant-scopes updates and deletions and reports stale records', async () => {
    const updated = builder({ data: row, error: null });
    supabase.from.mockReturnValueOnce(updated);
    await expect(ubahJadwalMateri('school-a', 'learning-1', 'teacher-a', {
      kind: 'schedule', className: '7A', title: 'Matematika', body: 'Bab bilangan.',
      startsAt: row.starts_at, published: true,
    })).resolves.toMatchObject({ id: row.id });
    expect(updated.eq.mock.calls).toEqual([
      ['tenant_id', 'school-a'],
      ['id', 'learning-1'],
    ]);

    const missing = builder({ data: null, error: null });
    supabase.from.mockReturnValueOnce(missing);
    await expect(ubahJadwalMateri('school-a', 'stale', 'teacher-a', {
      kind: 'schedule', className: '7A', title: 'Matematika', body: 'Bab bilangan.',
      startsAt: row.starts_at, published: true,
    })).rejects.toThrow('tidak ditemukan');

    const deleted = builder({ data: null, error: new Error('denied') });
    supabase.from.mockReturnValueOnce(deleted);
    await expect(hapusJadwalMateri('school-a', 'learning-1')).rejects.toThrow('denied');
  });

  it('uses guarded RPCs for task submission, staff review, and student feedback', async () => {
    supabase.rpc.mockResolvedValueOnce({
      data: [{ submission_id: 'submission-a', submitted_at: row.created_at }],
      error: null,
    });
    await expect(kirimJawabanTugas('task-a', ' Jawaban tugas.\nBaris kedua. ')).resolves.toEqual({
      id: 'submission-a',
      submittedAt: row.created_at,
    });
    expect(supabase.rpc).toHaveBeenCalledWith('submit_school_task', {
      p_task_id: 'task-a',
      p_answer: 'Jawaban tugas.\nBaris kedua.',
    });

    supabase.rpc.mockResolvedValueOnce({
      data: [{
        task_id: 'task-a',
        answer: 'Jawaban tugas.',
        submitted_at: row.created_at,
        feedback: null,
        reviewed_at: null,
      }],
      error: null,
    });
    await expect(muatPengumpulanTugasSiswa()).resolves.toMatchObject([
      { taskId: 'task-a', answer: 'Jawaban tugas.', feedback: null },
    ]);

    supabase.rpc.mockResolvedValueOnce({
      data: [{
        submission_id: 'submission-a',
        student_name: 'Siswa A',
        class_name: '7A',
        answer: 'Jawaban tugas.',
        submitted_at: row.created_at,
        feedback: 'Bagus.',
        reviewed_at: row.updated_at,
      }],
      error: null,
    });
    await expect(muatPengumpulanTugasStaf('task-a')).resolves.toMatchObject([
      { id: 'submission-a', studentName: 'Siswa A', feedback: 'Bagus.' },
    ]);

    supabase.rpc.mockResolvedValueOnce({ error: null });
    await expect(beriUmpanBalikTugas('submission-a', ' Bagus. ')).resolves.toBeUndefined();
    expect(supabase.rpc).toHaveBeenLastCalledWith('review_school_task_submission', {
      p_submission_id: 'submission-a',
      p_feedback: 'Bagus.',
    });

    await expect(kirimJawabanTugas('', 'jawaban')).rejects.toThrow('ID tugas');
    await expect(kirimJawabanTugas('task-a', '  ')).rejects.toThrow('Jawaban');
    await expect(muatPengumpulanTugasStaf('')).rejects.toThrow('ID tugas');
    await expect(beriUmpanBalikTugas('submission-a', 'x'.repeat(5001))).rejects.toThrow('5000');
  });
});
