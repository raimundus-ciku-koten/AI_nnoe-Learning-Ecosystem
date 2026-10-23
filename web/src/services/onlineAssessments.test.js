import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { supabase } = vi.hoisted(() => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock('../lib/supabase.ts', () => ({ supabase }));

import {
  buatUjianOnline,
  muatAkunSiswaBelumTertaut,
  muatAkunSiswaTertaut,
  daftarDraftUjian,
  muatHasilUjianGuru,
  hapusDraftUjian,
  kirimJawabanUjian,
  muatDraftUjian,
  muatSoalUjianGuru,
  muatRosterBelumTertaut,
  muatUjianSiswa,
  muatNilaiUjianSiswa,
  ringkasNilaiUjianSiswa,
  muatJawabanUraianGuru,
  muatRingkasanUjianGuru,
  mulaiUjianOnline,
  nilaiJawabanUraian,
  simpanDraftUjian,
  tautkanAkunSiswa,
  lepasTautanAkunSiswa,
} from './onlineAssessments.js';

function createStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    key: (index) => [...values.keys()][index] ?? null,
  };
}

const exam = {
  examId: 'exam-1',
  attemptId: 'attempt-1',
  title: 'Matematika',
  deadline: '2099-10-18T02:00:00.000Z',
  questions: [{
    id: 'question-1',
    kind: 'pilihan_ganda',
    prompt: '1 + 1?',
    choices: ['1', '2'],
    position: 1,
  }],
};

describe('online assessment service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('sessionStorage', createStorage());
  });
  afterEach(() => vi.unstubAllGlobals());

  it('loads exam question content without accepting a leaked answer key', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: exam, error: null });
    await expect(mulaiUjianOnline('exam-1')).resolves.toEqual(exam);
    expect(supabase.rpc).toHaveBeenCalledWith('start_student_online_exam', {
      p_exam_id: 'exam-1',
    });

    supabase.rpc.mockResolvedValueOnce({
      data: { ...exam, questions: [{ ...exam.questions[0], correct_answer: '2' }] },
      error: null,
    });
    await expect(mulaiUjianOnline('exam-1')).rejects.toThrow('tidak valid');

    supabase.rpc.mockResolvedValueOnce({
      data: { ...exam, questions: [{ ...exam.questions[0], choices: ['1'] }] },
      error: null,
    });
    await expect(mulaiUjianOnline('exam-1')).rejects.toThrow('tidak valid');
  });

  it('validates student exam list fields before exposing them to the exam UI', async () => {
    const examRow = {
      exam_id: 'ad8ae9d1-6d1f-4a10-9cf2-7106e74f4075',
      title: 'Matematika',
      kelas: '7A',
      starts_at: '2026-10-23T08:00:00.000Z',
      ends_at: '2026-10-23T09:00:00.000Z',
      duration_minutes: 60,
      attempt_status: 'not_started',
    };
    supabase.rpc.mockResolvedValueOnce({ data: [examRow], error: null });
    await expect(muatUjianSiswa()).resolves.toEqual([examRow]);

    const unicodeExam = {
      ...examRow,
      title: '😀'.repeat(160),
      kelas: '😀'.repeat(30),
    };
    supabase.rpc.mockResolvedValueOnce({ data: [unicodeExam], error: null });
    await expect(muatUjianSiswa()).resolves.toEqual([unicodeExam]);

    supabase.rpc.mockResolvedValueOnce({
      data: [{ ...examRow, attempt_status: 'unknown' }],
      error: null,
    });
    await expect(muatUjianSiswa()).rejects.toThrow('tidak valid');

    supabase.rpc.mockResolvedValueOnce({
      data: [{ ...examRow, title: '😀'.repeat(161) }],
      error: null,
    });
    await expect(muatUjianSiswa()).rejects.toThrow('tidak valid');

    supabase.rpc.mockResolvedValueOnce({
      data: [{ ...examRow, ends_at: examRow.starts_at }],
      error: null,
    });
    await expect(muatUjianSiswa()).rejects.toThrow('tidak valid');

    supabase.rpc.mockResolvedValueOnce({
      data: [{ ...examRow, exam_id: 'not-a-uuid' }],
      error: null,
    });
    await expect(muatUjianSiswa()).rejects.toThrow('tidak valid');

    supabase.rpc.mockResolvedValueOnce({
      data: [{ ...examRow, correct_answer: '2' }],
      error: null,
    });
    await expect(muatUjianSiswa()).rejects.toThrow('tidak valid');

    supabase.rpc.mockResolvedValueOnce({ data: null, error: new Error('denied') });
    await expect(muatUjianSiswa()).rejects.toThrow('denied');
  });

  it('creates exams with bounded fields and unique question IDs', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: 'exam-1', error: null });
    await expect(buatUjianOnline({
      title: ' Ujian ',
      kelas: ' X ',
      startsAt: '2026-10-18T01:00:00Z',
      endsAt: '2026-10-18T02:00:00Z',
      durationMinutes: 60,
      questionIds: ['question-1'],
    })).resolves.toBe('exam-1');
    expect(supabase.rpc).toHaveBeenCalledWith('create_online_exam', expect.objectContaining({
      p_title: 'Ujian',
      p_kelas: 'X',
      p_question_ids: ['question-1'],
    }));

    await expect(buatUjianOnline({
      title: 'Ujian',
      kelas: 'X',
      startsAt: '2026-10-18T01:00:00Z',
      endsAt: '2026-10-18T02:00:00Z',
      durationMinutes: 60,
      questionIds: ['question-1', 'question-1'],
    })).rejects.toThrow('tidak valid');
  });

  it('loads teacher questions only for the requested tenant and owner', async () => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      order: vi.fn(() => query),
      limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
    };
    supabase.from.mockReturnValueOnce(query);
    await expect(muatSoalUjianGuru('tenant-1', 'teacher-1')).resolves.toEqual([]);
    expect(query.eq.mock.calls).toEqual([
      ['tenant_id', 'tenant-1'],
      ['owner_id', 'teacher-1'],
    ]);
    expect(query.select).toHaveBeenCalledWith('id,mapel,kelas,jenis,pertanyaan,pilihan');
  });

  it('lists unmapped roster/accounts and links accounts through restricted RPCs', async () => {
    supabase.rpc
      .mockResolvedValueOnce({ data: [{ student_id: 'student-1', nama: 'Ayu', kelas: 'X' }], error: null })
      .mockResolvedValueOnce({ data: [{ user_id: 'user-1', email: 'ayu@example.test', nama: 'Ayu' }], error: null })
      .mockResolvedValueOnce({ data: [{ student_id: 'student-2', user_id: 'user-2' }], error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [{
        attempt_id: 'attempt-1',
        exam_id: 'exam-1',
        title: 'Ujian',
        kelas: '7A',
        student_name: 'Siswa',
        submitted_at: '2026-10-23T08:00:00.000Z',
        score: 85,
        objective_correct: 8,
        objective_total: 10,
        essay_score: null,
        grade_pending: false,
      }], error: null })
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: 85, error: null });
    await expect(muatRosterBelumTertaut()).resolves.toHaveLength(1);
    await expect(muatAkunSiswaBelumTertaut()).resolves.toHaveLength(1);
    await expect(muatAkunSiswaTertaut()).resolves.toHaveLength(1);
    await expect(tautkanAkunSiswa('student-1', 'user-1')).resolves.toBeUndefined();
    await expect(lepasTautanAkunSiswa('student-2')).resolves.toBeUndefined();
    await expect(muatRingkasanUjianGuru()).resolves.toEqual([]);
    await expect(muatJawabanUraianGuru()).resolves.toEqual([]);
    await expect(muatHasilUjianGuru()).resolves.toMatchObject([{ attempt_id: 'attempt-1' }]);
    await expect(muatNilaiUjianSiswa()).resolves.toEqual([]);
    await expect(nilaiJawabanUraian('attempt-1', 85)).resolves.toBe(85);
    expect(supabase.rpc.mock.calls.map(([name]) => name)).toEqual([
      'unlinked_student_roster',
      'unlinked_student_accounts',
      'linked_student_accounts',
      'link_student_account',
      'unlink_student_account',
      'teacher_online_exam_overview',
      'teacher_online_exam_essay_reviews',
      'teacher_online_exam_results',
      'student_online_exam_results',
      'review_online_exam_essays',
    ]);
  });

  it('rejects malformed teacher assessment result rows', async () => {
    supabase.rpc.mockResolvedValueOnce({
      data: [{
        attempt_id: 'attempt-1',
        exam_id: 'exam-1',
        title: 'Ujian',
        kelas: '7A',
        student_name: 'Siswa',
        submitted_at: 'invalid-date',
        score: 85,
        objective_correct: 8,
        objective_total: 10,
        essay_score: null,
        grade_pending: false,
      }],
      error: null,
    });

    await expect(muatHasilUjianGuru()).rejects.toThrow('tidak valid');
  });

  it('summarizes only graded student results and identifies the newest submission', () => {
    const summary = ringkasNilaiUjianSiswa([
      {
        exam_id: 'exam-a',
        title: 'Ujian lama',
        kelas: '7A',
        submitted_at: '2026-10-20T08:00:00.000Z',
        score: 80,
        grade_pending: false,
      },
      {
        exam_id: 'exam-b',
        title: 'Ujian baru',
        kelas: '7A',
        submitted_at: '2026-10-22T08:00:00.000Z',
        score: null,
        grade_pending: true,
      },
      {
        exam_id: 'exam-c',
        title: 'Nilai belum tersedia',
        kelas: '7A',
        submitted_at: '2026-10-21T08:00:00.000Z',
        score: null,
        grade_pending: false,
      },
    ]);
    expect(summary).toMatchObject({
      resultCount: 3,
      gradedCount: 1,
      pendingCount: 1,
      averageScore: 80,
      latest: { exam_id: 'exam-b', title: 'Ujian baru' },
    });
    expect(ringkasNilaiUjianSiswa([])).toMatchObject({
      resultCount: 0,
      gradedCount: 0,
      pendingCount: 0,
      averageScore: null,
      latest: null,
    });
    expect(() => ringkasNilaiUjianSiswa([{
      exam_id: 'exam',
      title: 'Ujian',
      kelas: '7A',
      submitted_at: 'invalid',
      score: 80,
      grade_pending: false,
    }])).toThrow('tidak valid');
  });

  it('stores, enumerates, and removes a draft in the user-scoped browser session', () => {
    simpanDraftUjian('student-1', exam, { 'question-1': '2' }, 'submission-1');
    expect(muatDraftUjian('student-1', 'exam-1')).toMatchObject({
      exam,
      answers: { 'question-1': '2' },
      submissionId: 'submission-1',
    });
    expect(daftarDraftUjian('student-1')).toHaveLength(1);
    expect(daftarDraftUjian('student-2')).toEqual([]);
    hapusDraftUjian('student-1', 'exam-1');
    expect(muatDraftUjian('student-1', 'exam-1')).toBeNull();
  });

  it('requires server confirmation before treating an exam as submitted', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: { submitted: true, gradePending: false }, error: null });
    await expect(kirimJawabanUjian('attempt-1', 'submission-1', { 'question-1': '2' }))
      .resolves.toMatchObject({ submitted: true, gradePending: false });

    supabase.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(kirimJawabanUjian('attempt-1', 'submission-2', {}))
      .rejects.toThrow('belum mengonfirmasi');
  });

  it('surfaces RPC and storage validation errors', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: new Error('denied') });
    await expect(muatUjianSiswa()).rejects.toThrow('denied');
    expect(() => simpanDraftUjian('student-1', {
      ...exam,
      questions: [{ ...exam.questions[0], jawaban: '2' }],
    }, {})).toThrow('tidak valid');
  });

    it('validates the student results RPC shape and propagates its errors', async () => {
      const result = {
        exam_id: 'exam-1',
        title: 'Ujian',
        kelas: '7A',
        submitted_at: '2026-10-23T08:00:00.000Z',
        score: '85.5',
        grade_pending: false,
      };
      supabase.rpc.mockResolvedValueOnce({ data: [result], error: null });
      await expect(muatNilaiUjianSiswa()).resolves.toEqual([result]);
      expect(supabase.rpc).toHaveBeenCalledWith('student_online_exam_results');

      supabase.rpc.mockResolvedValueOnce({
        data: [{ ...result, submitted_at: 'bukan-tanggal' }],
        error: null,
      });
      await expect(muatNilaiUjianSiswa()).rejects.toThrow('tidak valid');

      supabase.rpc.mockResolvedValueOnce({ data: [], error: new Error('denied') });
      await expect(muatNilaiUjianSiswa()).rejects.toThrow('denied');
    });
});
