import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buatBarisAnalisisPenilaian,
  ringkasAnalisisPenilaian,
  ringkasPenilaianPerAktivitas,
} from '../src/services/classroomAssessmentReport.js';

const reports = [{
  room: { id: 'class-1', nama: 'X-A', mapel: 'Matematika' },
  assignments: [{ id: 'task-1', judul: 'Latihan pecahan' }],
  submissions: [
    {
      id: 'submission-1', assignmentId: 'task-1', userId: 'student-1',
      namaSiswa: 'Siswa Satu', nilai: 80, dikirim: '2026-10-01T09:00:00Z', umpanBalik: '',
    },
    {
      id: 'submission-2', assignmentId: 'task-1', userId: 'student-2',
      namaSiswa: 'Siswa Dua', nilai: null, dikirim: '2026-10-02T09:00:00Z', umpanBalik: '',
    },
    {
      id: 'submission-3', assignmentId: 'other-task', userId: 'student-3',
      namaSiswa: 'Tidak cocok', nilai: 100, dikirim: '2026-10-03T09:00:00Z', umpanBalik: '',
    },
  ],
  quizzes: [{ id: 'quiz-1', judul: 'Kuis pecahan' }],
  quizResults: [{
    id: 'quiz-submission-1', quizId: 'quiz-1', userId: 'student-1',
    namaSiswa: 'Siswa Satu', nilai: 90, dikirim: '2026-10-04T09:00:00Z',
  }],
}];

test('analisis hanya menggabungkan hasil dari tugas dan kuis kelas yang diketahui', () => {
  const rows = buatBarisAnalisisPenilaian(reports);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(({ activityType }) => activityType), ['Kuis', 'Tugas', 'Tugas']);
  assert.equal(rows[0].studentName, 'Siswa Satu');
  assert.equal(rows[1].score, null);
});

test('ringkasan tidak mengarang rata-rata untuk data kosong atau yang belum dinilai', () => {
  assert.deepEqual(ringkasAnalisisPenilaian([]), {
    jumlahPengumpulan: 0, jumlahDinilai: 0, jumlahMenunggu: 0, rataRata: null,
  });
  assert.deepEqual(ringkasAnalisisPenilaian([{ score: null }, { score: 80 }, { score: 90 }]), {
    jumlahPengumpulan: 3, jumlahDinilai: 2, jumlahMenunggu: 1, rataRata: 85,
  });
});

test('ringkasan aktivitas memisahkan jumlah dinilai dan yang masih menunggu', () => {
  const activities = ringkasPenilaianPerAktivitas(buatBarisAnalisisPenilaian(reports));
  assert.deepEqual(activities.map(({ activityName, jumlahDinilai, jumlahMenunggu, rataRata }) => ({
    activityName, jumlahDinilai, jumlahMenunggu, rataRata,
  })), [
    { activityName: 'Kuis pecahan', jumlahDinilai: 1, jumlahMenunggu: 0, rataRata: 90 },
    { activityName: 'Latihan pecahan', jumlahDinilai: 1, jumlahMenunggu: 1, rataRata: 80 },
  ]);
});

test('validasi menolak nilai di luar rentang', () => {
  assert.throws(() => ringkasAnalisisPenilaian([{ score: 101 }]), /tidak valid/);
  assert.throws(() => buatBarisAnalisisPenilaian(null), /tidak valid/);
});
