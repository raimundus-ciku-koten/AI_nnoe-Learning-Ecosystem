import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabase = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('../lib/supabase.ts', () => ({ supabase }));

import {
  buatTugasRuangKelas,
  buatKuisRuangKelas,
  buatSesiPresensiKelas,
  buatMateriRuangKelas,
  buatRuangKelas,
  kirimJawabanTugas,
  kirimJawabanKuis,
  muatPengumpulanTugas,
  muatDaftarRuangKelas,
  muatKandidatAnggotaRuangKelas,
  muatMateriRuangKelas,
  muatKuisRuangKelas,
  muatSoalKuisUntukSiswa,
  muatHasilKuisSiswa,
  muatCatatanPresensiKelas,
  muatRosterPresensiKelas,
  muatSesiPresensiKelas,
  muatTugasRuangKelas,
  muatTugasUntukDasbor,
  nilaiPengumpulanTugas,
  muatTenantRuangKelas,
  simpanPresensiKelas,
  ringkasNilaiKuis,
} from './learningClassrooms.js';

describe('learning classrooms service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('summarizes validated quiz scores without inventing a value for an empty set', () => {
    expect(ringkasNilaiKuis([])).toEqual({ rataRata: null, jumlahHasil: 0 });
    expect(ringkasNilaiKuis([{ nilai: 80 }, { nilai: 91 }]))
      .toEqual({ rataRata: 86, jumlahHasil: 2 });
    expect(() => ringkasNilaiKuis([{ nilai: 101 }]))
      .toThrow('Daftar nilai kuis tidak valid');
  });

  it('sends normalized classroom details and assigned members to the protected RPC', async () => {
    supabase.rpc.mockResolvedValue({ data: 'room-1', error: null });
    const roomId = await buatRuangKelas({
      tenantId: 'school-1',
      nama: '  Matematika X-A  ',
      mapel: ' Matematika ',
      tingkat: ' X-A ',
      tahunAjaran: ' 2026/2027 ',
      guruIds: ['teacher-1'],
      siswaIds: ['student-1'],
    });

    expect(roomId).toBe('room-1');
    expect(supabase.rpc).toHaveBeenCalledWith('create_learning_classroom', {
      p_tenant_id: 'school-1',
      p_name: 'Matematika X-A',
      p_subject: 'Matematika',
      p_grade: 'X-A',
      p_academic_year: '2026/2027',
      p_teacher_ids: ['teacher-1'],
      p_student_ids: ['student-1'],
    });
  });

  it('rejects invalid or overlapping member assignments before the RPC', async () => {
    await expect(buatRuangKelas({
      tenantId: 'school-1',
      nama: 'K',
      mapel: 'Mapel',
      tingkat: '',
      tahunAjaran: '2026/2027',
      guruIds: [],
      siswaIds: [],
    })).rejects.toThrow('Nama, mata pelajaran');

    await expect(buatRuangKelas({
      tenantId: 'school-1',
      nama: 'Kelas A',
      mapel: 'Matematika',
      tingkat: 'X-A',
      tahunAjaran: '2026/2027',
      guruIds: ['same-user'],
      siswaIds: ['same-user'],
    })).rejects.toThrow('guru dan siswa');

    await expect(buatRuangKelas({
      tenantId: 'school-1',
      nama: 'Kelas B',
      mapel: 'Matematika',
      tingkat: 'X-A',
      tahunAjaran: '2026/2027',
      guruIds: ['teacher-1'],
      siswaIds: [],
    })).rejects.toThrow('Daftar siswa tidak valid');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('rejects missing tenant and malformed room rows instead of returning success-shaped data', async () => {
    await expect(muatDaftarRuangKelas('')).rejects.toThrow('Pilih sekolah aktif');
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(async () => ({ data: [{ id: 'bad' }], error: null })),
    };
    supabase.from.mockReturnValue(builder);
    await expect(muatDaftarRuangKelas('school-1'))
      .rejects.toThrow('data Ruang Kelas yang tidak valid');
  });

  it('loads active schools and uses the restricted candidate RPC', async () => {
    const tenantsBuilder = {
      select: vi.fn(() => tenantsBuilder),
      eq: vi.fn(() => tenantsBuilder),
      order: vi.fn(async () => ({
        data: [{ id: 'school-1', name: 'Sekolah Satu' }],
        error: null,
      })),
    };
    supabase.from.mockReturnValue(tenantsBuilder);
    await expect(muatTenantRuangKelas()).resolves.toEqual([
      { id: 'school-1', nama: 'Sekolah Satu' },
    ]);

    supabase.rpc.mockResolvedValue({
      data: [{ id: 'teacher-1', nama: 'Guru Satu', role: 'guru' }],
      error: null,
    });
    await expect(muatKandidatAnggotaRuangKelas('school-1')).resolves.toEqual([
      { id: 'teacher-1', nama: 'Guru Satu', role: 'guru' },
    ]);
    expect(supabase.rpc).toHaveBeenCalledWith('learning_classroom_candidates', {
      p_tenant_id: 'school-1',
    });
  });

  it('loads materials scoped to the selected class and tenant', async () => {
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(async () => ({
        data: [{
          id: 'material-1',
          classroom_id: 'room-1',
          tenant_id: 'school-1',
          title: 'Pengantar',
          content: 'Materi awal',
          created_by: 'teacher-1',
          created_at: '2026-10-24T10:00:00.000Z',
        }],
        error: null,
      })),
    };
    supabase.from.mockReturnValue(builder);

    await expect(muatMateriRuangKelas('room-1', 'school-1')).resolves.toEqual([{
      id: 'material-1',
      classroomId: 'room-1',
      tenantId: 'school-1',
      judul: 'Pengantar',
      isi: 'Materi awal',
      dibuatOleh: 'teacher-1',
      dibuat: '2026-10-24T10:00:00.000Z',
    }]);
    expect(supabase.from).toHaveBeenCalledWith('learning_classroom_materials');
    expect(builder.eq).toHaveBeenNthCalledWith(1, 'classroom_id', 'room-1');
    expect(builder.eq).toHaveBeenNthCalledWith(2, 'tenant_id', 'school-1');
  });

  it('validates and inserts material text without accepting empty content', async () => {
    const builder = {
      insert: vi.fn(() => builder),
      select: vi.fn(() => builder),
      single: vi.fn(async () => ({
        data: {
          id: 'material-2',
          classroom_id: 'room-1',
          tenant_id: 'school-1',
          title: 'Pengayaan',
          content: 'Bacalah bab dua.',
          created_by: 'teacher-1',
          created_at: '2026-10-24T11:00:00.000Z',
        },
        error: null,
      })),
    };
    supabase.from.mockReturnValue(builder);

    await expect(buatMateriRuangKelas({
      classroomId: 'room-1',
      tenantId: 'school-1',
      judul: ' Pengayaan ',
      isi: ' Bacalah bab dua. ',
    })).resolves.toMatchObject({ judul: 'Pengayaan', isi: 'Bacalah bab dua.' });
    expect(builder.insert).toHaveBeenCalledWith({
      classroom_id: 'room-1',
      tenant_id: 'school-1',
      title: 'Pengayaan',
      content: 'Bacalah bab dua.',
    });

    await expect(buatMateriRuangKelas({
      classroomId: 'room-1',
      tenantId: 'school-1',
      judul: 'Judul',
      isi: '   ',
    })).rejects.toThrow('Judul, isi, atau ruang kelas');
    expect(builder.insert).toHaveBeenCalledTimes(1);
  });

  it('creates a class assignment with a validated optional deadline', async () => {
    const builder = {
      insert: vi.fn(() => builder),
      select: vi.fn(() => builder),
      single: vi.fn(async () => ({
        data: {
          id: 'assignment-1',
          classroom_id: 'room-1',
          tenant_id: 'school-1',
          title: 'Latihan',
          instructions: 'Kerjakan soal berikut.',
          due_at: '2026-10-25T09:00:00.000Z',
          created_by: 'teacher-1',
          created_at: '2026-10-24T12:00:00.000Z',
        },
        error: null,
      })),
    };
    supabase.from.mockReturnValue(builder);

    await expect(buatTugasRuangKelas({
      classroomId: 'room-1',
      tenantId: 'school-1',
      judul: ' Latihan ',
      instruksi: ' Kerjakan soal berikut. ',
      tenggat: '2026-10-25T09:00:00.000Z',
    })).resolves.toMatchObject({
      id: 'assignment-1',
      judul: 'Latihan',
      tenggat: '2026-10-25T09:00:00.000Z',
    });
    expect(builder.insert).toHaveBeenCalledWith({
      classroom_id: 'room-1',
      tenant_id: 'school-1',
      title: 'Latihan',
      instructions: 'Kerjakan soal berikut.',
      due_at: '2026-10-25T09:00:00.000Z',
    });
  });

  it('loads assignments and teacher submissions through their scoped endpoints', async () => {
    const assignmentsBuilder = {
      select: vi.fn(() => assignmentsBuilder),
      eq: vi.fn(() => assignmentsBuilder),
      order: vi.fn(() => assignmentsBuilder),
      limit: vi.fn(async () => ({
        data: [{
          id: 'assignment-1',
          classroom_id: 'room-1',
          tenant_id: 'school-1',
          title: 'Latihan',
          instructions: 'Kerjakan.',
          due_at: null,
          created_by: 'teacher-1',
          created_at: '2026-10-24T12:00:00.000Z',
        }],
        error: null,
      })),
    };
    supabase.from.mockReturnValue(assignmentsBuilder);
    await expect(muatTugasRuangKelas('room-1', 'school-1')).resolves.toMatchObject([
      { id: 'assignment-1', judul: 'Latihan', tenggat: null },
    ]);

    supabase.rpc.mockResolvedValue({
      data: [{
        assignment_id: 'assignment-1',
        submission_id: 'submission-1',
        user_id: 'student-1',
        student_name: 'Siswa Satu',
        answer: 'Jawaban',
        submitted_at: '2026-10-24T13:00:00.000Z',
        score: null,
        feedback: null,
        graded_at: null,
      }],
      error: null,
    });
    await expect(muatPengumpulanTugas('room-1', 'guru')).resolves.toMatchObject([
      { id: 'submission-1', namaSiswa: 'Siswa Satu', jawaban: 'Jawaban' },
    ]);
    expect(supabase.rpc).toHaveBeenCalledWith('learning_classroom_teacher_submissions', {
      p_classroom_id: 'room-1',
    });
  });

  it('loads only recent assignments for the teacher classroom list in one scoped query', async () => {
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      in: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(async () => ({
        data: [{
          id: 'assignment-1',
          classroom_id: 'room-1',
          tenant_id: 'school-1',
          title: 'Latihan',
          instructions: 'Kerjakan.',
          due_at: null,
          created_by: 'teacher-1',
          created_at: '2026-10-24T12:00:00.000Z',
        }],
        error: null,
      })),
    };
    supabase.from.mockReturnValue(builder);

    await expect(muatTugasUntukDasbor('school-1', ['room-1', 'room-2']))
      .resolves.toMatchObject([{ id: 'assignment-1', classroomId: 'room-1' }]);
    expect(supabase.from).toHaveBeenCalledWith('learning_classroom_assignments');
    expect(builder.eq).toHaveBeenCalledWith('tenant_id', 'school-1');
    expect(builder.in).toHaveBeenCalledWith('classroom_id', ['room-1', 'room-2']);
    expect(builder.limit).toHaveBeenCalledWith(5);

    await expect(muatTugasUntukDasbor('school-1', [])).resolves.toEqual([]);
    await expect(muatTugasUntukDasbor('school-1', ['room-1', 'room-1']))
      .rejects.toThrow('Daftar ruang kelas tidak valid');
  });

  it('submits answers and grades only through protected server RPCs', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: 'submission-1', error: null })
      .mockResolvedValueOnce({ data: 'submission-1', error: null });
    await expect(kirimJawabanTugas('assignment-1', '  Jawaban siswa  '))
      .resolves.toBe('submission-1');
    await expect(nilaiPengumpulanTugas('submission-1', 88, 'Bagus.'))
      .resolves.toBe('submission-1');
    expect(supabase.rpc).toHaveBeenNthCalledWith(1, 'submit_learning_classroom_assignment', {
      p_assignment_id: 'assignment-1',
      p_answer: 'Jawaban siswa',
    });
    expect(supabase.rpc).toHaveBeenNthCalledWith(2, 'grade_learning_classroom_submission', {
      p_submission_id: 'submission-1',
      p_score: 88,
      p_feedback: 'Bagus.',
    });
    await expect(nilaiPengumpulanTugas('submission-1', 101)).rejects.toThrow('Nilai atau umpan balik');
  });

  it('loads only the student submissions for assignments in the current class', async () => {
    const builder = {
      select: vi.fn(() => builder),
      in: vi.fn(async () => ({
        data: [{
          id: 'submission-1',
          assignment_id: 'assignment-1',
          user_id: 'student-1',
          answer: 'Jawaban',
          submitted_at: '2026-10-24T14:00:00.000Z',
          score: 90,
          feedback: 'Baik.',
          graded_at: '2026-10-24T15:00:00.000Z',
        }],
        error: null,
      })),
    };
    supabase.from.mockReturnValue(builder);

    await expect(muatPengumpulanTugas('room-1', 'siswa', ['assignment-1']))
      .resolves.toMatchObject([{
        id: 'submission-1',
        assignmentId: 'assignment-1',
        nilai: 90,
        umpanBalik: 'Baik.',
      }]);
    expect(builder.in).toHaveBeenCalledWith('assignment_id', ['assignment-1']);
  });

  it('creates quizzes through a protected RPC after validating questions and answer keys', async () => {
    supabase.rpc.mockResolvedValue({ data: 'quiz-1', error: null });
    await expect(buatKuisRuangKelas({
      classroomId: 'room-1',
      tenantId: 'school-1',
      judul: ' Kuis bab satu ',
      tenggat: null,
      soal: [{
        pertanyaan: ' 2 + 2 = ? ',
        pilihan: ['3', '4'],
        jawabanBenar: 1,
      }],
    })).resolves.toBe('quiz-1');
    expect(supabase.rpc).toHaveBeenCalledWith('create_learning_classroom_quiz', {
      p_classroom_id: 'room-1',
      p_title: 'Kuis bab satu',
      p_due_at: null,
      p_questions: [{
        prompt: '2 + 2 = ?',
        choices: ['3', '4'],
        correctChoice: 1,
      }],
    });

    await expect(buatKuisRuangKelas({
      classroomId: 'room-1',
      tenantId: 'school-1',
      judul: 'Kuis',
      tenggat: null,
      soal: [{ pertanyaan: 'Soal', pilihan: ['A', 'B'], jawabanBenar: 2 }],
    })).rejects.toThrow('Data kuis tidak valid');
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  it('loads student-safe quiz questions and validates auto-graded result responses', async () => {
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(async () => ({
        data: [{
          id: 'quiz-1',
          classroom_id: 'room-1',
          tenant_id: 'school-1',
          title: 'Kuis bab satu',
          due_at: null,
          created_by: 'teacher-1',
          created_at: '2026-10-24T12:00:00.000Z',
        }],
        error: null,
      })),
    };
    supabase.from.mockReturnValue(builder);
    await expect(muatKuisRuangKelas('room-1', 'school-1')).resolves.toMatchObject([
      { id: 'quiz-1', judul: 'Kuis bab satu' },
    ]);

    supabase.rpc.mockResolvedValueOnce({
      data: [{
        question_id: 'question-1',
        position: 1,
        prompt: '2 + 2 = ?',
        choices: ['3', '4'],
      }],
      error: null,
    });
    await expect(muatSoalKuisUntukSiswa('quiz-1')).resolves.toEqual([{
      id: 'question-1',
      urutan: 1,
      pertanyaan: '2 + 2 = ?',
      pilihan: ['3', '4'],
    }]);
    expect(supabase.rpc).toHaveBeenCalledWith('learning_classroom_quiz_questions_for_student', {
      p_quiz_id: 'quiz-1',
    });

    supabase.rpc.mockResolvedValueOnce({
      data: [{ submission_id: 'result-1', score: 100, correct_count: 1, question_count: 1 }],
      error: null,
    });
    await expect(kirimJawabanKuis('quiz-1', [1])).resolves.toEqual({
      id: 'result-1',
      nilai: 100,
      benar: 1,
      jumlahSoal: 1,
    });
    expect(supabase.rpc).toHaveBeenLastCalledWith('submit_learning_classroom_quiz', {
      p_quiz_id: 'quiz-1',
      p_answers: [1],
    });
  });

  it('loads attendance sessions and teacher roster through scoped sources', async () => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        order: vi.fn(() => builder),
        limit: vi.fn(async () => ({
          data: [{
            id: 'attendance-1',
            classroom_id: 'room-1',
            tenant_id: 'school-1',
            attendance_date: '2026-10-24',
            title: 'Presensi pagi',
            created_by: 'teacher-1',
            created_at: '2026-10-24T07:00:00.000Z',
          }],
          error: null,
        })),
      };
      supabase.from.mockReturnValue(builder);
      await expect(muatSesiPresensiKelas('room-1', 'school-1')).resolves.toEqual([{
        id: 'attendance-1',
        classroomId: 'room-1',
        tenantId: 'school-1',
        tanggal: '2026-10-24',
        judul: 'Presensi pagi',
        dibuatOleh: 'teacher-1',
        dibuat: '2026-10-24T07:00:00.000Z',
      }]);

      supabase.rpc.mockResolvedValue({
        data: [{ student_id: 'student-1', student_name: 'Siswa Satu' }],
        error: null,
      });
      await expect(muatRosterPresensiKelas('room-1')).resolves.toEqual([
        { id: 'student-1', nama: 'Siswa Satu' },
      ]);
      expect(supabase.rpc).toHaveBeenCalledWith('learning_classroom_attendance_roster', {
        p_classroom_id: 'room-1',
      });
  });

  it('loads attendance records and creates sessions via protected endpoints', async () => {
      const builder = {
        select: vi.fn(() => builder),
        in: vi.fn(async () => ({
          data: [{
            session_id: 'attendance-1',
            student_id: 'student-1',
            status: 'hadir',
            note: null,
            marked_at: '2026-10-24T07:10:00.000Z',
          }],
          error: null,
        })),
      };
      supabase.from.mockReturnValue(builder);
      await expect(muatCatatanPresensiKelas(['attendance-1'])).resolves.toMatchObject([
        { sessionId: 'attendance-1', studentId: 'student-1', status: 'hadir' },
      ]);
      await expect(muatCatatanPresensiKelas([])).resolves.toEqual([]);
      expect(builder.in).toHaveBeenCalledWith('session_id', ['attendance-1']);

      supabase.rpc.mockResolvedValue({ data: 'attendance-2', error: null });
      await expect(buatSesiPresensiKelas({
        classroomId: 'room-1',
        tanggal: '2026-10-24',
        judul: '  Presensi siang  ',
      })).resolves.toBe('attendance-2');
      expect(supabase.rpc).toHaveBeenCalledWith(
        'create_learning_classroom_attendance_session',
        {
          p_classroom_id: 'room-1',
          p_attendance_date: '2026-10-24',
          p_title: 'Presensi siang',
        },
      );
  });

  it('validates complete unique attendance batches before server-side recording', async () => {
      supabase.rpc.mockResolvedValue({ data: 2, error: null });
      const records = [
        { studentId: 'student-1', status: 'hadir', note: '' },
        { studentId: 'student-2', status: 'izin', note: 'Sakit keluarga' },
      ];
      await expect(simpanPresensiKelas('attendance-1', records)).resolves.toBe(2);
      expect(supabase.rpc).toHaveBeenCalledWith('record_learning_classroom_attendance', {
        p_session_id: 'attendance-1',
        p_records: [
          { studentId: 'student-1', status: 'hadir', note: null },
          { studentId: 'student-2', status: 'izin', note: 'Sakit keluarga' },
        ],
      });

      await expect(simpanPresensiKelas('attendance-1', [
        ...records,
        { studentId: 'student-1', status: 'alpa', note: '' },
      ])).rejects.toThrow('Daftar presensi siswa tidak valid');
      await expect(simpanPresensiKelas('attendance-1', [
        { studentId: 'student-1', status: '', note: '' },
      ])).rejects.toThrow('Daftar presensi siswa tidak valid');
      expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  it('loads only a student’s quiz results through the RLS-protected table', async () => {
    const builder = {
      select: vi.fn(() => builder),
      in: vi.fn(async () => ({
        data: [{
          quiz_id: 'quiz-1',
          id: 'result-1',
          user_id: 'student-1',
          score: 80,
          correct_count: 4,
          question_count: 5,
          submitted_at: '2026-10-24T15:00:00.000Z',
        }],
        error: null,
      })),
    };
    supabase.from.mockReturnValue(builder);
    await expect(muatHasilKuisSiswa(['quiz-1'])).resolves.toMatchObject([
      { quizId: 'quiz-1', id: 'result-1', nilai: 80, benar: 4, jumlahSoal: 5 },
    ]);
    expect(builder.in).toHaveBeenCalledWith('quiz_id', ['quiz-1']);
  });
});
