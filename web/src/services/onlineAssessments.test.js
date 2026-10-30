import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { supabase } = vi.hoisted(() => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock('../lib/supabase.ts', () => ({ supabase }));

import {
  buatDataEksporHasilUjian,
  buatTautanUjianSiswa,
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
  muatJawabanUraianGuru,
  muatRingkasanUjianGuru,
  muatRingkasanUjianSekolah,
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

  it('creates a student exam link on the same origin and validates the exam identifier', () => {
    const examId = '11111111-1111-4111-8111-111111111111';
    expect(buatTautanUjianSiswa(examId, 'https://school.example', '/app'))
      .toBe(`https://school.example/app#/siswa/ujian?examId=${examId}`);
    expect(() => buatTautanUjianSiswa('not-a-uuid', 'https://school.example', '/'))
      .toThrow('ID ujian tidak valid');
    expect(() => buatTautanUjianSiswa(examId, 'javascript:alert(1)', '/'))
      .toThrow();
  });

  it('exports selected exam results without publishing pending grades or silently truncating rows', () => {
    const rows = [
      {
        exam_id: 'exam-1',
        title: 'Ujian Matematika',
        kelas: 'X',
        student_name: 'Ayu',
        submitted_at: '2026-10-18T02:00:00Z',
        score: 90,
        objective_correct: 9,
        objective_total: 10,
        grade_pending: false,
      },
      {
        exam_id: 'exam-2',
        title: 'Ujian IPA',
        kelas: 'X',
        student_name: 'Bima',
        submitted_at: '2026-10-18T02:05:00Z',
        score: null,
        objective_correct: 7,
        objective_total: 10,
        grade_pending: true,
      },
    ];
    expect(buatDataEksporHasilUjian(rows, 'exam-2')).toEqual([
      ['Nama siswa', 'Ujian', 'Kelas', 'Dikumpulkan (UTC)', 'PG benar', 'PG total', 'Nilai akhir', 'Status'],
      ['Bima', 'Ujian IPA', 'X', '2026-10-18T02:05:00Z', '7', '10', '', 'Menunggu penilaian uraian'],
    ]);
    expect(() => buatDataEksporHasilUjian(Array.from({ length: 500 }, (_, index) => ({
      ...rows[0],
      attempt_id: `attempt-${index}`,
    })))).toThrow('499 hasil');
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
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: 85, error: null });
    await expect(muatRosterBelumTertaut()).resolves.toHaveLength(1);
    await expect(muatAkunSiswaBelumTertaut()).resolves.toHaveLength(1);
    await expect(muatAkunSiswaTertaut()).resolves.toHaveLength(1);
    await expect(tautkanAkunSiswa('student-1', 'user-1')).resolves.toBeUndefined();
    await expect(lepasTautanAkunSiswa('student-2')).resolves.toBeUndefined();
    await expect(muatRingkasanUjianGuru()).resolves.toEqual([]);
    await expect(muatJawabanUraianGuru()).resolves.toEqual([]);
    await expect(muatHasilUjianGuru()).resolves.toEqual([]);
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

  it('loads safe tenant-level exam counts for school administrators', async () => {
    const row = {
      exam_id: 'exam-1',
      title: 'Ujian Matematika',
      kelas: 'X-A',
      starts_at: '2026-10-30T01:00:00.000Z',
      ends_at: '2026-10-30T02:00:00.000Z',
      duration_minutes: 60,
      status: 'active',
      teacher_name: 'Guru A',
      participant_count: 28,
      attempt_count: 20,
      submitted_count: 18,
      pending_review_count: 2,
    };
    supabase.rpc.mockResolvedValueOnce({ data: [row], error: null });

    await expect(muatRingkasanUjianSekolah()).resolves.toEqual([row]);
    expect(supabase.rpc).toHaveBeenCalledWith('school_admin_online_exam_overview');
  });

  it('rejects school overview rows containing student names or answer data', async () => {
    supabase.rpc.mockResolvedValueOnce({
      data: [{
        exam_id: 'exam-1',
        title: 'Ujian',
        kelas: 'X-A',
        starts_at: '2026-10-30T01:00:00.000Z',
        ends_at: '2026-10-30T02:00:00.000Z',
        duration_minutes: 60,
        status: 'active',
        teacher_name: 'Guru A',
        participant_count: 1,
        attempt_count: 1,
        submitted_count: 1,
        pending_review_count: 0,
        student_name: 'Siswa',
      }],
      error: null,
    });
    await expect(muatRingkasanUjianSekolah()).rejects.toThrow('tidak valid');
  });
});
