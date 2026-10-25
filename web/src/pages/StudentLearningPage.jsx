import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import {
  muatDaftarRuangKelas,
  muatCatatanPresensiKelas,
  muatJadwalRuangKelas,
  muatHasilKuisSiswa,
  muatKuisRuangKelas,
  muatMateriRuangKelas,
  muatPengumpulanTugas,
  muatTugasRuangKelas,
  muatSesiPresensiKelas,
} from '../services/learningClassrooms.js';
import { muatNilaiUjianSiswa } from '../services/onlineAssessments.js';
import '../styles/learning-classrooms.css';

const MODE_MATERI = '/siswa/materi';
const MODE_NILAI = '/siswa/nilai';
const LABEL_STATUS_PRESENSI = {
  hadir: 'Hadir',
  izin: 'Izin',
  sakit: 'Sakit',
  alpa: 'Tanpa keterangan',
};
const HARI_MINGGU = [
  'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu',
];

export function tautanKeKelas(classroomId, jenisAktivitas, activityId) {
  const params = new URLSearchParams({ kelas: classroomId });
  if (jenisAktivitas && activityId) params.set(jenisAktivitas, activityId);
  return `#/ruang-kelas?${params}`;
}

export function riwayatPresensiSiswa(sessions, records, classroomName, userId) {
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  return records
    .filter((record) => record.studentId === userId && sessionsById.has(record.sessionId))
    .map((record) => {
      const session = sessionsById.get(record.sessionId);
      return {
        id: `${record.sessionId}:${record.studentId}`,
        tanggal: session.tanggal,
        judul: session.judul,
        namaKelas: classroomName,
        status: LABEL_STATUS_PRESENSI[record.status],
        catatan: record.catatan,
      };
    })
    .sort((a, b) => b.tanggal.localeCompare(a.tanggal));
}

export function hasilKuisMilikSiswa(results, userId) {
  return results.filter((result) => result.userId === userId);
}

export function urutkanJadwalSiswa(schedules) {
  return [...schedules].sort((a, b) =>
    a.hari - b.hari || a.mulai.localeCompare(b.mulai) ||
    a.namaKelas.localeCompare(b.namaKelas, 'id'));
}

export function JadwalPelajaranSiswa({ schedules }) {
  const ordered = urutkanJadwalSiswa(schedules);
  return (
    <section className="ale-classrooms-materials" aria-labelledby="student-schedule-title">
      <h3 id="student-schedule-title">Jadwal pelajaran</h3>
      {ordered.length ? (
        <ul className="ale-classrooms-assignment-list">
          {ordered.map((schedule) => (
            <li key={schedule.id}>
              <h4>{HARI_MINGGU[schedule.hari - 1]} · {schedule.mulai}–{schedule.selesai}</h4>
              <small>{schedule.namaKelas}</small>
              <p>{schedule.topik}{schedule.tempat ? ` · ${schedule.tempat}` : ''}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ale-classrooms-empty">
          Belum ada jadwal pelajaran yang diterbitkan untuk kelas Anda.
        </p>
      )}
    </section>
  );
}

function waktu(nilai) {
  if (!nilai) return 'Tanpa tenggat';
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: nilai.includes('T') ? 'short' : undefined,
  }).format(new Date(nilai));
}

export function StudentGrades({ tasks, quizzes, quizResults, examResults }) {
  const resultByQuiz = new Map(quizResults.map((result) => [result.quizId, result]));

  return (
    <section className="ale-classrooms-materials" aria-labelledby="student-grades-title">
      <h3 id="student-grades-title">Hasil belajar</h3>
      <section aria-labelledby="student-assignment-grades-title">
        <h4 id="student-assignment-grades-title">Tugas dan nilai</h4>
        {tasks.length ? (
          <ul className="ale-classrooms-assignment-list">
            {tasks.map((task) => (
              <li key={task.id}>
                <h4>{task.judul}</h4>
                <small>{task.namaKelas}</small>
                <p>
                  {!task.submission
                    ? 'Belum dikumpulkan'
                    : task.submission.nilai === null
                      ? 'Jawaban dikirim · menunggu penilaian'
                      : `Nilai: ${task.submission.nilai}`}
                </p>
                {task.submission?.umpanBalik && <small>Umpan balik: {task.submission.umpanBalik}</small>}
                <a className="ale-classrooms-submit" href={tautanKeKelas(task.classroomId, 'tugas', task.id)}>
                  Buka tugas
                </a>
              </li>
            ))}
          </ul>
        ) : <p className="ale-classrooms-empty">Belum ada tugas untuk kelas Anda.</p>}
      </section>
      <section aria-labelledby="student-quiz-grades-title">
        <h4 id="student-quiz-grades-title">Nilai kuis</h4>
        {quizzes.length ? (
          <ul className="ale-classrooms-assignment-list">
            {quizzes.map((quiz) => {
              const result = resultByQuiz.get(quiz.id);
              return (
                <li key={quiz.id}>
                  <h4>{quiz.judul}</h4>
                  <small>{quiz.namaKelas}</small>
                  <p>{result ? `Nilai: ${result.nilai}` : 'Belum dikerjakan'}</p>
                  <a className="ale-classrooms-submit" href={tautanKeKelas(quiz.classroomId, 'kuis', quiz.id)}>
                    Buka kuis
                  </a>
                </li>
              );
            })}
          </ul>
        ) : <p className="ale-classrooms-empty">Belum ada kuis untuk kelas Anda.</p>}
      </section>
      <section aria-labelledby="student-exam-grades-title">
        <h4 id="student-exam-grades-title">Nilai ujian online</h4>
        {examResults.length ? (
          <ul className="ale-classrooms-assignment-list">
            {examResults.map((result) => (
              <li key={result.exam_id}>
                <h4>{result.title}</h4>
                <small>Kelas {result.kelas} · dikumpulkan {waktu(result.submitted_at)}</small>
                <p>{result.grade_pending ? 'Menunggu penilaian uraian' : `Nilai: ${result.score ?? 'belum tersedia'}`}</p>
                <a className="ale-classrooms-submit" href="#/siswa/ujian">Buka ujian saya</a>
              </li>
            ))}
          </ul>
        ) : <p className="ale-classrooms-empty">Belum ada hasil ujian online.</p>}
      </section>
    </section>
  );
}

export default function StudentLearningPage() {
  const { user, role: baseRole, activeRole, tenantId } = useAuth();
  const role = activeRole || baseRole;
  const { pathname } = useLocation();
  const materiMode = pathname === MODE_MATERI;
  const nilaiMode = pathname === MODE_NILAI;
  const [data, setData] = useState({
    classes: [], materials: [], tasks: [], quizzes: [], results: [], attendance: [],
    schedules: [], examResults: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      if (role !== 'siswa' || !user?.uid || !tenantId) {
        setData({
          classes: [], materials: [], tasks: [], quizzes: [], results: [], attendance: [],
          schedules: [], examResults: [],
        });
        setError(role !== 'siswa'
          ? 'Halaman ini hanya tersedia untuk akun siswa.'
          : 'Akun siswa belum terhubung ke sekolah aktif.');
        setLoading(false);
        return;
      }
      try {
        const classes = await muatDaftarRuangKelas(tenantId);
        const [perClass, examResults] = await Promise.all([
          Promise.all(classes.map(async (room) => {
            if (materiMode) {
              return {
                room,
                materials: await muatMateriRuangKelas(room.id, room.tenantId),
                tasks: [],
                quizzes: [],
                submissions: [],
                attendance: [],
                schedules: [],
              };
            }
            const [tasks, quizzes, attendanceSessions, schedules] = await Promise.all([
              muatTugasRuangKelas(room.id, room.tenantId),
              muatKuisRuangKelas(room.id, room.tenantId),
              nilaiMode ? Promise.resolve([]) : muatSesiPresensiKelas(room.id, room.tenantId),
              nilaiMode ? Promise.resolve([]) : muatJadwalRuangKelas(room.id, room.tenantId, user.uid),
            ]);
            const [submissions, results, attendanceRecords] = await Promise.all([
              muatPengumpulanTugas(room.id, role, tasks.map((task) => task.id)),
              muatHasilKuisSiswa(quizzes.map((quiz) => quiz.id)),
              nilaiMode
                ? Promise.resolve([])
                : muatCatatanPresensiKelas(attendanceSessions.map((session) => session.id)),
            ]);
            return {
              room, materials: [], tasks, quizzes, submissions, results,
              attendanceSessions, attendanceRecords, schedules,
            };
          })),
          nilaiMode ? muatNilaiUjianSiswa() : Promise.resolve([]),
        ]);
        if (!active) return;
        setData({
          classes,
          materials: perClass.flatMap(({ room, materials }) =>
            materials.map((material) => ({ ...material, namaKelas: room.nama }))),
          tasks: perClass.flatMap(({ room, tasks, submissions }) =>
            tasks.map((task) => ({
              ...task,
              namaKelas: room.nama,
              submission: submissions.find((submission) =>
                submission.assignmentId === task.id && submission.userId === user.uid),
            }))),
          quizzes: perClass.flatMap(({ room, quizzes }) =>
            quizzes.map((quiz) => ({ ...quiz, namaKelas: room.nama }))),
          results: hasilKuisMilikSiswa(
            perClass.flatMap(({ results = [] }) => results),
            user.uid,
          ),
          attendance: perClass.flatMap(({ room, attendanceSessions = [], attendanceRecords = [] }) =>
            riwayatPresensiSiswa(attendanceSessions, attendanceRecords, room.nama, user.uid)),
          schedules: urutkanJadwalSiswa(perClass.flatMap(({ room, schedules = [] }) =>
            schedules.map((schedule) => ({ ...schedule, namaKelas: room.nama })))),
          examResults,
        });
      } catch (loadError) {
        console.error('[student-learning] Gagal memuat kegiatan belajar:', loadError);
        if (active) setError('Kegiatan belajar tidak dapat dimuat. Periksa koneksi dan akses sekolah, lalu coba lagi.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [materiMode, nilaiMode, retry, role, tenantId, user?.uid]);

  if (role !== 'siswa') {
    return <p className="ale-classrooms-message is-error" role="alert">Halaman ini hanya tersedia untuk akun siswa.</p>;
  }

  const title = materiMode ? 'Materi Saya' : nilaiMode ? 'Nilai Saya' : 'Jadwal dan Tugas';
  const resultByQuiz = new Map(data.results.map((result) => [result.quizId, result]));
  const tasks = [...data.tasks].sort((a, b) =>
    (a.tenggat || '9999').localeCompare(b.tenggat || '9999'));
  const quizzes = [...data.quizzes].sort((a, b) =>
    (a.tenggat || '9999').localeCompare(b.tenggat || '9999'));
  const learningLinks = [
    { href: '/siswa/jadwal', label: 'Jadwal dan tugas', active: !materiMode && !nilaiMode },
    { href: '/siswa/materi', label: 'Materi', active: materiMode },
    { href: '/siswa/nilai', label: 'Nilai saya', active: nilaiMode },
    { href: '/siswa/ujian', label: 'Ujian saya', active: false },
    { href: '/siswa/rapor', label: 'Rapor resmi', active: false },
  ];

  return (
    <main className="ale-classrooms ale-student-learning">
      <header className="ale-classrooms-header">
        <p className="ale-classrooms-kicker">Ruang Belajar</p>
        <h2>{title}</h2>
        <p>
          {materiMode
            ? 'Materi yang diterbitkan guru untuk kelas yang ditetapkan kepada Anda.'
            : nilaiMode
              ? 'Nilai tugas, kuis, dan ujian yang tercatat untuk akun siswa Anda.'
            : 'Jadwal yang diterbitkan guru; Tugas, kuis, dan tenggat dari kelas yang ditetapkan kepada Anda.'}
        </p>
        <nav className="ale-student-learning-nav" aria-label="Navigasi ruang belajar">
          {learningLinks.map(({ href, label, active }) => (
            <a
              key={href}
              href={`#${href}`}
              aria-current={active ? 'page' : undefined}
              className={active ? 'is-active' : ''}
            >
              {label}
            </a>
          ))}
        </nav>
      </header>
      {error && (
        <p className="ale-classrooms-message is-error" role="alert">
          {error}
          {user?.uid && tenantId && (
            <button type="button" onClick={() => setRetry((value) => value + 1)}>Coba lagi</button>
          )}
        </p>
      )}
      {loading ? (
        <p role="status">Memuat ruang belajar…</p>
      ) : !error && data.classes.length === 0 && !nilaiMode ? (
        <p className="ale-classrooms-empty" role="status">
          Belum ada kelas yang ditetapkan ke akun Anda. Hubungi operator sekolah.
        </p>
      ) : !error && materiMode ? (
        data.materials.length ? (
          <ul className="ale-classrooms-material-list">
            {data.materials.map((material) => (
              <li key={material.id}>
                <h3>{material.judul}</h3>
                <small>{material.namaKelas} · {waktu(material.dibuat)}</small>
                <p>{material.isi}</p>
                <a className="ale-classrooms-submit" href={tautanKeKelas(material.classroomId)}>
                  Buka kelas
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ale-classrooms-empty">Belum ada materi yang diterbitkan untuk kelas Anda.</p>
        )
      ) : !error && nilaiMode ? (
        <StudentGrades
          tasks={data.tasks}
          quizzes={data.quizzes}
          quizResults={data.results}
          examResults={data.examResults}
        />
      ) : !error ? (
        <>
          <JadwalPelajaranSiswa schedules={data.schedules} />
          <section className="ale-classrooms-materials" aria-labelledby="student-tasks-title">
            <h3 id="student-tasks-title">Tugas</h3>
            {tasks.length ? (
              <ul className="ale-classrooms-assignment-list">
                {tasks.map((task) => (
                  <li key={task.id}>
                    <h4>{task.judul}</h4>
                    <p>{task.instruksi}</p>
                    <small>{task.namaKelas} · Tenggat: {waktu(task.tenggat)}</small>
                    <p>
                      {task.submission
                        ? task.submission.nilai === null
                          ? 'Jawaban sudah dikirim · menunggu penilaian'
                          : `Nilai: ${task.submission.nilai}`
                        : task.tenggat && Date.parse(task.tenggat) < Date.now()
                          ? 'Tenggat sudah lewat'
                          : 'Belum dikumpulkan'}
                    </p>
                    {task.submission?.umpanBalik && <small>Umpan balik: {task.submission.umpanBalik}</small>}
                    <a className="ale-classrooms-submit" href={tautanKeKelas(task.classroomId, 'tugas', task.id)}>
                      Buka tugas
                    </a>
                  </li>
                ))}
              </ul>
            ) : <p className="ale-classrooms-empty">Belum ada tugas untuk kelas Anda.</p>}
          </section>
          <section className="ale-classrooms-materials" aria-labelledby="student-quizzes-title">
            <h3 id="student-quizzes-title">Kuis</h3>
            {quizzes.length ? (
              <ul className="ale-classrooms-assignment-list">
                {quizzes.map((quiz) => {
                  const result = resultByQuiz.get(quiz.id);
                  return (
                    <li key={quiz.id}>
                      <h4>{quiz.judul}</h4>
                      <small>{quiz.namaKelas} · Tenggat: {waktu(quiz.tenggat)}</small>
                      <p>{result ? `Selesai · nilai ${result.nilai}` : 'Belum dikerjakan'}</p>
                      <a className="ale-classrooms-submit" href={tautanKeKelas(quiz.classroomId, 'kuis', quiz.id)}>
                        Buka kuis
                      </a>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="ale-classrooms-empty">Belum ada kuis untuk kelas Anda.</p>}
          </section>
          <section className="ale-classrooms-materials" aria-labelledby="student-attendance-title">
            <h3 id="student-attendance-title">Riwayat presensi</h3>
            {data.attendance.length ? (
              <ul className="ale-classrooms-attendance-history">
                {data.attendance.map((record) => (
                  <li key={record.id}>
                    <strong>{record.status} · {record.judul}</strong>
                    <span>
                      {record.namaKelas} · {new Intl.DateTimeFormat('id-ID', {
                        dateStyle: 'long', timeZone: 'UTC',
                      }).format(new Date(`${record.tanggal}T00:00:00Z`))}
                    </span>
                    {record.catatan && <small>Catatan: {record.catatan}</small>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ale-classrooms-empty">Belum ada catatan presensi untuk akun Anda.</p>
            )}
          </section>
          <p className="ale-classrooms-footnote">
            Jadwal hanya menampilkan slot yang diterbitkan guru pada Ruang Kelas. Jadwal pribadi guru tidak dibagikan ke siswa.
          </p>
        </>
      ) : null}
    </main>
  );
}
