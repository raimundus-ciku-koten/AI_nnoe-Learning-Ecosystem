import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { auth } = vi.hoisted(() => ({
  auth: {
    role: 'siswa',
    activeRole: null,
    user: { uid: 'student-1' },
    tenantId: 'school-1',
  },
}));

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => auth,
}));

vi.mock('../services/learningClassrooms.js', () => ({
  muatDaftarRuangKelas: vi.fn(),
  muatCatatanPresensiKelas: vi.fn(),
  muatHasilKuisSiswa: vi.fn(),
  muatKuisRuangKelas: vi.fn(),
  muatMateriRuangKelas: vi.fn(),
  muatPengumpulanTugas: vi.fn(),
  muatTugasRuangKelas: vi.fn(),
  muatSesiPresensiKelas: vi.fn(),
}));
vi.mock('../services/onlineAssessments.js', () => ({
  muatNilaiUjianSiswa: vi.fn(),
}));

import StudentLearningPage, {
  hasilKuisMilikSiswa,
  riwayatPresensiSiswa,
  StudentGrades,
  tautanKeKelas,
} from './StudentLearningPage.jsx';

function render(path) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <StudentLearningPage />
    </MemoryRouter>,
  );
}

describe('StudentLearningPage', () => {
  beforeEach(() => {
    auth.role = 'siswa';
    auth.activeRole = null;
    auth.user = { uid: 'student-1' };
    auth.tenantId = 'school-1';
  });

  it('links student activities to their assigned class safely', () => {
    expect(tautanKeKelas('room-1')).toBe('#/ruang-kelas?kelas=room-1');
    expect(tautanKeKelas('kelas & 1', 'tugas', 'tugas 1'))
      .toBe('#/ruang-kelas?kelas=kelas+%26+1&tugas=tugas+1');
    expect(tautanKeKelas('room-1', 'kuis', 'quiz-1'))
      .toBe('#/ruang-kelas?kelas=room-1&kuis=quiz-1');
  });

  it('shows only the authenticated student attendance records in date order', () => {
    const sessions = [
      { id: 'session-older', tanggal: '2026-10-20', judul: 'Pagi' },
      { id: 'session-newer', tanggal: '2026-10-24', judul: 'Praktik' },
    ];
    const records = [
      {
        sessionId: 'session-older',
        studentId: 'student-1',
        status: 'hadir',
        catatan: '',
      },
      {
        sessionId: 'session-newer',
        studentId: 'student-1',
        status: 'izin',
        catatan: 'Izin keluarga',
      },
      {
        sessionId: 'session-newer',
        studentId: 'student-2',
        status: 'alpa',
        catatan: 'Data siswa lain',
      },
    ];

    expect(riwayatPresensiSiswa(sessions, records, 'Matematika X-A', 'student-1'))
      .toEqual([
        {
          id: 'session-newer:student-1',
          tanggal: '2026-10-24',
          judul: 'Praktik',
          namaKelas: 'Matematika X-A',
          status: 'Izin',
          catatan: 'Izin keluarga',
        },
        {
          id: 'session-older:student-1',
          tanggal: '2026-10-20',
          judul: 'Pagi',
          namaKelas: 'Matematika X-A',
          status: 'Hadir',
          catatan: '',
        },
      ]);
  });

  it('keeps quiz grades scoped to the authenticated student', () => {
    const results = [
      { quizId: 'quiz-1', userId: 'student-1', nilai: 90 },
      { quizId: 'quiz-1', userId: 'student-2', nilai: 45 },
    ];

    expect(hasilKuisMilikSiswa(results, 'student-1'))
      .toEqual([{ quizId: 'quiz-1', userId: 'student-1', nilai: 90 }]);
  });

  it('renders the live student assignments and quiz destination', () => {
    expect(render('/siswa/jadwal')).toContain('Jadwal dan Tugas');
    expect(render('/siswa/jadwal')).toContain('Tugas');
    expect(render('/siswa/jadwal')).toContain('kuis');
    expect(render('/siswa/jadwal')).toContain('Memuat ruang belajar');
  });

  it('renders the live class-material destination', () => {
    expect(render('/siswa/materi')).toContain('Materi Saya');
    expect(render('/siswa/materi')).toContain('Materi yang diterbitkan guru');
  });

  it('renders the Nilai Saya destination with task, quiz, and online exam results', () => {
    expect(render('/siswa/nilai')).toContain('Nilai Saya');
    expect(render('/siswa/nilai')).toContain('Nilai tugas, kuis, dan ujian');

    const grades = renderToStaticMarkup(
      <StudentGrades
        tasks={[
          {
            id: 'task-1',
            classroomId: 'room-1',
            judul: 'Latihan pecahan',
            namaKelas: 'Matematika X-A',
            submission: { nilai: 88, umpanBalik: 'Bagus' },
          },
          {
            id: 'task-2',
            classroomId: 'room-1',
            judul: 'Tugas berikutnya',
            namaKelas: 'Matematika X-A',
            submission: { nilai: null, umpanBalik: '' },
          },
        ]}
        quizzes={[{
          id: 'quiz-1',
          classroomId: 'room-1',
          judul: 'Kuis pecahan',
          namaKelas: 'Matematika X-A',
        }]}
        quizResults={[{ quizId: 'quiz-1', nilai: 92 }]}
        examResults={[{
          exam_id: 'exam-1',
          title: 'Ujian tengah semester',
          kelas: 'X-A',
          submitted_at: '2026-10-24T08:00:00Z',
          grade_pending: false,
          score: 86,
        }]}
      />,
    );

    expect(grades).toContain('Tugas dan nilai');
    expect(grades).toContain('Nilai: 88');
    expect(grades).toContain('Umpan balik: Bagus');
    expect(grades).toContain('menunggu penilaian');
    expect(grades).toContain('Nilai kuis');
    expect(grades).toContain('Nilai: 92');
    expect(grades).toContain('Nilai ujian online');
    expect(grades).toContain('Nilai: 86');
    expect(grades).toContain('href="#/ruang-kelas?kelas=room-1&amp;tugas=task-1"');
    expect(grades).toContain('href="#/ruang-kelas?kelas=room-1&amp;kuis=quiz-1"');
  });

  it('uses the selected student role when the account has multiple roles', () => {
    auth.role = 'admin_sekolah';
    auth.activeRole = 'siswa';

    const html = render('/siswa/jadwal');
    expect(html).toContain('<h2>Jadwal dan Tugas</h2>');
    expect(html).not.toContain('Halaman ini hanya tersedia untuk akun siswa.');
  });

  it('does not render student learning data for another role', () => {
    auth.role = 'guru';
    const html = render('/siswa/jadwal');
    expect(html).toContain('hanya tersedia untuk akun siswa');
    expect(html).not.toContain('Memuat ruang belajar');
  });
});
