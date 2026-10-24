import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import {
  buatRuangKelas,
  buatMateriRuangKelas,
  buatKuisRuangKelas,
  buatTugasRuangKelas,
  kirimJawabanTugas,
  kirimJawabanKuis,
  muatPengumpulanTugas,
  muatHasilKuisGuru,
  muatHasilKuisSiswa,
  buatSesiPresensiKelas,
  muatCatatanPresensiKelas,
  muatRosterPresensiKelas,
  muatSesiPresensiKelas,
  simpanPresensiKelas,
  muatDaftarRuangKelas,
  muatKandidatAnggotaRuangKelas,
  muatMateriRuangKelas,
  muatKuisRuangKelas,
  muatSoalKuisUntukSiswa,
  muatTugasRuangKelas,
  nilaiPengumpulanTugas,
  muatTenantRuangKelas,
  PERAN_GURU_KELAS,
} from '../services/learningClassrooms.js';
import '../styles/learning-classrooms.css';

const PERAN_PENGELOLA = new Set(['admin', 'admin_sekolah', 'operator', 'superadmin']);
const STATUS_PRESENSI = ['hadir', 'izin', 'sakit', 'alpa'];

export function bolehKelolaAktivitasKelas(role) {
  return PERAN_GURU_KELAS.includes(role);
}

const FORM_AWAL = {
  nama: '',
  mapel: '',
  tingkat: '',
  tahunAjaran: '',
  guruIds: [],
  siswaIds: [],
};

function draftKuisAwal() {
  return {
    judul: '',
    tenggat: '',
    soal: [{ pertanyaan: '', pilihanText: '', jawabanBenar: '0' }],
  };
}

function pilihanTerpilih(event) {
  return Array.from(event.currentTarget.selectedOptions, (option) => option.value);
}

function daftarTahunAjaran() {
  const tahun = new Date().getFullYear();
  return `${tahun}/${tahun + 1}`;
}

function tanggalHariIni() {
  const hariIni = new Date();
  return [
    hariIni.getFullYear(),
    String(hariIni.getMonth() + 1).padStart(2, '0'),
    String(hariIni.getDate()).padStart(2, '0'),
  ].join('-');
}

export default function RuangKelasPage() {
  const { user, role, tenantId } = useAuth();
  const location = useLocation();
  const canManage = PERAN_PENGELOLA.has(role);
  const isSuperadmin = role === 'superadmin';
  const [tenants, setTenants] = useState([]);
  const [tenantDipilih, setTenantDipilih] = useState('');
  const [rooms, setRooms] = useState([]);
  const [members, setMembers] = useState([]);
  const [materialsByRoom, setMaterialsByRoom] = useState({});
  const [materialsLoading, setMaterialsLoading] = useState({});
  const [materialsSaving, setMaterialsSaving] = useState({});
  const [materialsError, setMaterialsError] = useState({});
  const [materialDrafts, setMaterialDrafts] = useState({});
  const [assignmentsByRoom, setAssignmentsByRoom] = useState({});
  const [submissionsByRoom, setSubmissionsByRoom] = useState({});
  const [activitiesLoading, setActivitiesLoading] = useState({});
  const [activitiesError, setActivitiesError] = useState({});
  const [assignmentDrafts, setAssignmentDrafts] = useState({});
  const [answerDrafts, setAnswerDrafts] = useState({});
  const [gradeDrafts, setGradeDrafts] = useState({});
  const [activitySaving, setActivitySaving] = useState({});
  const [quizzesByRoom, setQuizzesByRoom] = useState({});
  const [quizResultsByRoom, setQuizResultsByRoom] = useState({});
  const [quizQuestions, setQuizQuestions] = useState({});
  const [quizDrafts, setQuizDrafts] = useState({});
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizLoading, setQuizLoading] = useState({});
  const [attendanceSessions, setAttendanceSessions] = useState({});
  const [attendanceRecords, setAttendanceRecords] = useState({});
  const [attendanceRoster, setAttendanceRoster] = useState({});
  const [attendanceDrafts, setAttendanceDrafts] = useState({});
  const [attendanceSessionDrafts, setAttendanceSessionDrafts] = useState({});
  const [selectedAttendanceSession, setSelectedAttendanceSession] = useState({});
  const [form, setForm] = useState(() => ({
    ...FORM_AWAL,
    tahunAjaran: daftarTahunAjaran(),
  }));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  const loadedMaterials = useRef(new Set());
  const loadingMaterials = useRef(new Set());
  const savingMaterialsRef = useRef(new Set());
  const loadedActivities = useRef(new Set());
  const loadingActivities = useRef(new Set());
  const savingActivities = useRef(new Set());

  useEffect(() => {
    if (!isSuperadmin) {
      setTenantDipilih(tenantId || '');
      return undefined;
    }

    let active = true;
    async function loadTenants() {
      setError('');
      try {
        const result = await muatTenantRuangKelas();
        if (active) setTenants(result);
      } catch (loadError) {
        console.error('[ruang-kelas] Gagal memuat daftar sekolah:', loadError);
        if (active) setError('Daftar sekolah aktif tidak dapat dimuat. Periksa koneksi dan izin Supabase.');
      }
    }
    loadTenants();
    return () => { active = false; };
  }, [isSuperadmin, tenantId]);

  const targetTenantId = isSuperadmin ? tenantDipilih : tenantId;

  useEffect(() => {
    let active = true;
    loadedMaterials.current.clear();
    loadingMaterials.current.clear();
    setMaterialsByRoom({});
    setMaterialsLoading({});
    setMaterialsError({});
    loadedActivities.current.clear();
    loadingActivities.current.clear();
    setAssignmentsByRoom({});
    setSubmissionsByRoom({});
    setQuizzesByRoom({});
    setQuizResultsByRoom({});
    setQuizQuestions({});
    setQuizAnswers({});
    setAttendanceSessions({});
    setAttendanceRecords({});
    setAttendanceRoster({});
    setAttendanceDrafts({});
    setSelectedAttendanceSession({});
    setActivitiesLoading({});
    setActivitiesError({});
    async function load() {
      setLoading(true);
      setError('');
      setRooms([]);
      setMembers([]);
      if (!user?.uid || !targetTenantId) {
        setLoading(false);
        return;
      }
      try {
        const [classrooms, candidates] = await Promise.all([
          muatDaftarRuangKelas(targetTenantId),
          canManage ? muatKandidatAnggotaRuangKelas(targetTenantId) : Promise.resolve([]),
        ]);
        if (active) {
          setRooms(classrooms);
          setMembers(candidates);
        }
      } catch (loadError) {
        console.error('[ruang-kelas] Gagal memuat ruang kelas:', loadError);
        if (active) setError('Ruang Kelas tidak dapat dimuat. Periksa koneksi, tenant, dan kebijakan akses Supabase.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [user?.uid, targetTenantId, canManage, refresh]);

  useEffect(() => {
    if (loading) return;
    const params = new URLSearchParams(location.search);
    const classroomId = params.get('kelas');
    if (!classroomId || !rooms.some((room) => room.id === classroomId)) return;
    const card = document.getElementById(`ruang-kelas-${classroomId}`);
    if (!card) return;
    card.open = true;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loading, location.search, rooms]);

  useEffect(() => {
    if (loading) return;
    const params = new URLSearchParams(location.search);
    const classroomId = params.get('kelas');
    const taskId = params.get('tugas');
    const quizId = params.get('kuis');
    if (!classroomId || (!taskId && !quizId) ||
        !loadedActivities.current.has(classroomId) ||
        activitiesLoading[classroomId]) return;
    const activityId = taskId || quizId;
    const exists = taskId
      ? (assignmentsByRoom[classroomId] || []).some((item) => item.id === taskId)
      : (quizzesByRoom[classroomId] || []).some((item) => item.id === quizId);
    if (!exists) return;
    document.getElementById(`ruang-aktivitas-${activityId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [
    activitiesLoading,
    assignmentsByRoom,
    loading,
    location.search,
    quizzesByRoom,
  ]);

  const teachers = members.filter((member) => PERAN_GURU_KELAS.includes(member.role));
  const students = members.filter((member) => member.role === 'siswa');

  async function muatAktivitas(room, force = false) {
    if (loadingActivities.current.has(room.id) ||
        (!force && loadedActivities.current.has(room.id))) return;
    loadingActivities.current.add(room.id);
    setActivitiesLoading((current) => ({ ...current, [room.id]: true }));
    setActivitiesError((current) => ({ ...current, [room.id]: '' }));
    try {
      const [assignments, quizzes, attendanceSessions] = await Promise.all([
        muatTugasRuangKelas(room.id, room.tenantId),
        muatKuisRuangKelas(room.id, room.tenantId),
        muatSesiPresensiKelas(room.id, room.tenantId),
      ]);
      const [submissions, quizResults, attendanceRecords, roster] = await Promise.all([
        muatPengumpulanTugas(
          room.id,
          role,
          assignments.map((assignment) => assignment.id),
        ),
        PERAN_GURU_KELAS.includes(role)
          ? muatHasilKuisGuru(room.id)
          : muatHasilKuisSiswa(quizzes.map((quiz) => quiz.id)),
        muatCatatanPresensiKelas(attendanceSessions.map((session) => session.id)),
        bolehKelolaAktivitasKelas(role)
          ? muatRosterPresensiKelas(room.id)
          : Promise.resolve([]),
      ]);
      setAssignmentsByRoom((current) => ({ ...current, [room.id]: assignments }));
      setSubmissionsByRoom((current) => ({ ...current, [room.id]: submissions }));
      setQuizzesByRoom((current) => ({ ...current, [room.id]: quizzes }));
      setQuizResultsByRoom((current) => ({ ...current, [room.id]: quizResults }));
      setAttendanceSessions((current) => ({ ...current, [room.id]: attendanceSessions }));
      setAttendanceRecords((current) => ({
        ...current,
        [room.id]: attendanceRecords,
      }));
      setAttendanceRoster((current) => ({ ...current, [room.id]: roster }));
      setAttendanceDrafts((current) => ({
        ...Object.fromEntries(attendanceSessions.map((session) => {
          const savedByStudent = new Map(attendanceRecords
            .filter((record) => record.sessionId === session.id)
            .map((record) => [record.studentId, record]));
          return [session.id, Object.fromEntries(roster.map((student) => {
            const saved = savedByStudent.get(student.id);
            return [student.id, {
              status: saved?.status || '',
              note: saved?.catatan || '',
            }];
          }))];
        })),
        ...current,
      }));
      if (attendanceSessions.length && !selectedAttendanceSession[room.id]) {
        setSelectedAttendanceSession((current) => ({
          ...current,
          [room.id]: attendanceSessions[0].id,
        }));
      }
      loadedActivities.current.add(room.id);
    } catch (loadError) {
      console.error('[ruang-kelas] Gagal memuat tugas:', loadError);
      setActivitiesError((current) => ({
        ...current,
        [room.id]: 'Aktivitas kelas tidak dapat dimuat. Periksa koneksi dan izin Supabase.',
      }));
    } finally {
      loadingActivities.current.delete(room.id);
      setActivitiesLoading((current) => ({ ...current, [room.id]: false }));
    }
  }

  async function muatMateri(room) {
    if (loadedMaterials.current.has(room.id) || loadingMaterials.current.has(room.id)) return;
    loadingMaterials.current.add(room.id);
    setMaterialsLoading((current) => ({ ...current, [room.id]: true }));
    setMaterialsError((current) => ({ ...current, [room.id]: '' }));
    try {
      const materials = await muatMateriRuangKelas(room.id, room.tenantId);
      setMaterialsByRoom((current) => ({ ...current, [room.id]: materials }));
      loadedMaterials.current.add(room.id);
    } catch (loadError) {
      console.error('[ruang-kelas] Gagal memuat materi:', loadError);
      setMaterialsError((current) => ({
        ...current,
        [room.id]: 'Materi tidak dapat dimuat. Periksa koneksi dan izin Supabase.',
      }));
    } finally {
      loadingMaterials.current.delete(room.id);
      setMaterialsLoading((current) => ({ ...current, [room.id]: false }));
    }

    function pilihSesiPresensi(room, sessionId) {
      setSelectedAttendanceSession((current) => ({ ...current, [room.id]: sessionId }));
      const roster = attendanceRoster[room.id] || [];
      const savedRecords = attendanceRecords[room.id] || [];
      const savedByStudent = new Map(savedRecords
        .filter((record) => record.sessionId === sessionId)
        .map((record) => [record.studentId, record]));
      setAttendanceDrafts((current) => ({
        ...current,
        [sessionId]: Object.fromEntries(roster.map((student) => {
          const saved = savedByStudent.get(student.id);
          return [student.id, {
            status: saved?.status || '',
            note: saved?.catatan || '',
          }];
        })),
      }));
    }

    function ubahDraftPresensi(sessionId, studentId, field, value) {
      setAttendanceDrafts((current) => ({
        ...current,
        [sessionId]: {
          ...current[sessionId],
          [studentId]: {
            status: current[sessionId]?.[studentId]?.status || '',
            note: current[sessionId]?.[studentId]?.note || '',
            [field]: value,
          },
        },
      }));
    }

    async function buatSesiPresensi(event, room) {
      event.preventDefault();
      const draft = attendanceSessionDrafts[room.id] || {
        tanggal: tanggalHariIni(),
        judul: 'Presensi kelas',
      };
      const key = `attendance-session:${room.id}`;
      if (savingActivities.current.has(key)) return;
      savingActivities.current.add(key);
      setActivitySaving((current) => ({ ...current, [key]: true }));
      setActivitiesError((current) => ({ ...current, [room.id]: '' }));
      try {
        await buatSesiPresensiKelas({
          classroomId: room.id,
          ...draft,
        });
        loadedActivities.current.delete(room.id);
        await muatAktivitas(room, true);
        setAttendanceSessionDrafts((current) => ({
          ...current,
          [room.id]: { tanggal: tanggalHariIni(), judul: 'Presensi kelas' },
        }));
        setNotice('Sesi presensi berhasil dibuat.');
      } catch (saveError) {
        console.error('[ruang-kelas] Gagal membuat sesi presensi:', saveError);
        setActivitiesError((current) => ({
          ...current,
          [room.id]: saveError?.message || 'Sesi presensi tidak dapat dibuat.',
        }));
      } finally {
        savingActivities.current.delete(key);
        setActivitySaving((current) => ({ ...current, [key]: false }));
      }
    }

    async function simpanPresensi(event, room, session) {
      event.preventDefault();
      const key = `attendance:${session.id}`;
      if (savingActivities.current.has(key)) return;
      const draft = attendanceDrafts[session.id] || {};
      const records = (attendanceRoster[room.id] || []).map((student) => ({
        studentId: student.id,
        status: draft[student.id]?.status || '',
        note: draft[student.id]?.note || '',
      }));
      savingActivities.current.add(key);
      setActivitySaving((current) => ({ ...current, [key]: true }));
      setActivitiesError((current) => ({ ...current, [room.id]: '' }));
      try {
        await simpanPresensiKelas(session.id, records);
        loadedActivities.current.delete(room.id);
        await muatAktivitas(room, true);
        setNotice('Presensi seluruh siswa berhasil disimpan.');
      } catch (saveError) {
        console.error('[ruang-kelas] Gagal menyimpan presensi:', saveError);
        setActivitiesError((current) => ({
          ...current,
          [room.id]: saveError?.message || 'Presensi tidak dapat disimpan.',
        }));
      } finally {
        savingActivities.current.delete(key);
        setActivitySaving((current) => ({ ...current, [key]: false }));
      }
    }
  }

  function ubahForm(event) {
    const { name, value } = event.currentTarget;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function ubahDraftMateri(roomId, field, value) {
    setMaterialDrafts((current) => ({
      ...current,
      [roomId]: { ...current[roomId], [field]: value },
    }));
  }

  async function simpanMateri(event, room) {
    event.preventDefault();
    if (savingMaterialsRef.current.has(room.id)) return;
    const draft = materialDrafts[room.id] || { judul: '', isi: '' };
    savingMaterialsRef.current.add(room.id);
    setMaterialsSaving((current) => ({ ...current, [room.id]: true }));
    setMaterialsError((current) => ({ ...current, [room.id]: '' }));
    try {
      const material = await buatMateriRuangKelas({
        classroomId: room.id,
        tenantId: room.tenantId,
        ...draft,
      });
      setMaterialsByRoom((current) => ({
        ...current,
        [room.id]: [material, ...(current[room.id] || [])].slice(0, 100),
      }));
      loadedMaterials.current.add(room.id);
      setMaterialDrafts((current) => ({ ...current, [room.id]: { judul: '', isi: '' } }));
      setNotice('Materi berhasil diterbitkan untuk anggota kelas.');
    } catch (saveError) {
      console.error('[ruang-kelas] Gagal menerbitkan materi:', saveError);
      setMaterialsError((current) => ({
        ...current,
        [room.id]: saveError?.message || 'Materi tidak dapat diterbitkan.',
      }));
    } finally {
      savingMaterialsRef.current.delete(room.id);
      setMaterialsSaving((current) => ({ ...current, [room.id]: false }));
    }
  }

  function ubahDraftAktivitas(setter, roomId, key, value) {
    setter((current) => ({
      ...current,
      [roomId]: { ...current[roomId], [key]: value },
    }));
  }

  function ubahDraftKuis(roomId, key, value) {
    setQuizDrafts((current) => ({
      ...current,
      [roomId]: { ...draftKuisAwal(), ...current[roomId], [key]: value },
    }));
  }

  function ubahSoalKuis(roomId, questionIndex, updates) {
    setQuizDrafts((current) => {
      const draft = { ...draftKuisAwal(), ...current[roomId] };
      return {
        ...current,
        [roomId]: {
          ...draft,
          soal: draft.soal.map((question, index) =>
            index === questionIndex ? { ...question, ...updates } : question),
        },
      };
    });
  }

  function tambahSoalKuis(roomId) {
    setQuizDrafts((current) => {
      const draft = { ...draftKuisAwal(), ...current[roomId] };
      if (draft.soal.length >= 50) return current;
      return {
        ...current,
        [roomId]: {
          ...draft,
          soal: [...draft.soal, { pertanyaan: '', pilihanText: '', jawabanBenar: '0' }],
        },
      };
    });
  }

  function hapusSoalKuis(roomId, questionIndex) {
    setQuizDrafts((current) => {
      const draft = { ...draftKuisAwal(), ...current[roomId] };
      if (draft.soal.length <= 1) return current;
      return {
        ...current,
        [roomId]: {
          ...draft,
          soal: draft.soal.filter((_, index) => index !== questionIndex),
        },
      };
    });
  }

  async function simpanTugas(event, room) {
    event.preventDefault();
    if (savingActivities.current.has(`assignment:${room.id}`)) return;
    const draft = assignmentDrafts[room.id] || { judul: '', instruksi: '', tenggat: '' };
    savingActivities.current.add(`assignment:${room.id}`);
    setActivitySaving((current) => ({ ...current, [`assignment:${room.id}`]: true }));
    setActivitiesError((current) => ({ ...current, [room.id]: '' }));
    try {
      const assignment = await buatTugasRuangKelas({
        classroomId: room.id,
        tenantId: room.tenantId,
        judul: draft.judul,
        instruksi: draft.instruksi,
        tenggat: draft.tenggat ? new Date(draft.tenggat).toISOString() : null,
      });
      setAssignmentsByRoom((current) => ({
        ...current,
        [room.id]: [assignment, ...(current[room.id] || [])],
      }));
      loadedActivities.current.add(room.id);
      setAssignmentDrafts((current) => ({
        ...current,
        [room.id]: { judul: '', instruksi: '', tenggat: '' },
      }));
      setNotice('Tugas berhasil diterbitkan untuk anggota kelas.');
    } catch (saveError) {
      console.error('[ruang-kelas] Gagal membuat tugas:', saveError);
      setActivitiesError((current) => ({
        ...current,
        [room.id]: saveError?.message || 'Tugas tidak dapat diterbitkan.',
      }));
    } finally {
      savingActivities.current.delete(`assignment:${room.id}`);
      setActivitySaving((current) => ({ ...current, [`assignment:${room.id}`]: false }));
    }
  }

  async function kirimTugas(event, room, assignment) {
    event.preventDefault();
    const key = `submit:${assignment.id}`;
    if (savingActivities.current.has(key)) return;
    savingActivities.current.add(key);
    setActivitySaving((current) => ({ ...current, [key]: true }));
    setActivitiesError((current) => ({ ...current, [room.id]: '' }));
    try {
      await kirimJawabanTugas(assignment.id, answerDrafts[assignment.id] || '');
      setAnswerDrafts((current) => ({ ...current, [assignment.id]: '' }));
      loadedActivities.current.delete(room.id);
      await muatAktivitas(room, true);
      setNotice('Jawaban tugas berhasil dikirim.');
    } catch (saveError) {
      console.error('[ruang-kelas] Gagal mengirim jawaban:', saveError);
      setActivitiesError((current) => ({
        ...current,
        [room.id]: saveError?.message || 'Jawaban tugas tidak dapat dikirim.',
      }));
    } finally {
      savingActivities.current.delete(key);
      setActivitySaving((current) => ({ ...current, [key]: false }));
    }
  }

  async function nilaiTugas(event, room, submission) {
    event.preventDefault();
    const key = `grade:${submission.id}`;
    if (savingActivities.current.has(key)) return;
    const draft = gradeDrafts[submission.id] || {
      nilai: submission.nilai ?? '',
      umpanBalik: submission.umpanBalik || '',
    };
    savingActivities.current.add(key);
    setActivitySaving((current) => ({ ...current, [key]: true }));
    setActivitiesError((current) => ({ ...current, [room.id]: '' }));
    try {
      await nilaiPengumpulanTugas(submission.id, draft.nilai, draft.umpanBalik);
      loadedActivities.current.delete(room.id);
      await muatAktivitas(room, true);
      setNotice('Penilaian tugas berhasil disimpan.');
    } catch (saveError) {
      console.error('[ruang-kelas] Gagal menyimpan penilaian tugas:', saveError);
      setActivitiesError((current) => ({
        ...current,
        [room.id]: saveError?.message || 'Penilaian tugas tidak dapat disimpan.',
      }));
    } finally {
      savingActivities.current.delete(key);
      setActivitySaving((current) => ({ ...current, [key]: false }));
    }
  }

  async function mulaiKuis(quiz) {
    if (quizLoading[quiz.id] || quizQuestions[quiz.id]) return;
    setQuizLoading((current) => ({ ...current, [quiz.id]: true }));
    setActivitiesError((current) => ({ ...current, [quiz.classroomId]: '' }));
    try {
      const questions = await muatSoalKuisUntukSiswa(quiz.id);
      setQuizQuestions((current) => ({ ...current, [quiz.id]: questions }));
      setQuizAnswers((current) => ({
        ...current,
        [quiz.id]: Array(questions.length).fill(null),
      }));
    } catch (loadError) {
      console.error('[ruang-kelas] Gagal memuat soal kuis:', loadError);
      setActivitiesError((current) => ({
        ...current,
        [quiz.classroomId]: loadError?.message || 'Soal kuis tidak dapat dimuat.',
      }));
    } finally {
      setQuizLoading((current) => ({ ...current, [quiz.id]: false }));
    }
  }

  async function terbitkanKuis(event, room) {
    event.preventDefault();
    const draft = { ...draftKuisAwal(), ...quizDrafts[room.id] };
    const key = `quiz:${room.id}`;
    if (savingActivities.current.has(key)) return;
    const soal = draft.soal.map((question) => ({
      pertanyaan: question.pertanyaan,
      pilihan: question.pilihanText.split('\n').map((choice) => choice.trim()).filter(Boolean),
      jawabanBenar: Number(question.jawabanBenar),
    }));
    savingActivities.current.add(key);
    setActivitySaving((current) => ({ ...current, [key]: true }));
    setActivitiesError((current) => ({ ...current, [room.id]: '' }));
    try {
      await buatKuisRuangKelas({
        classroomId: room.id,
        tenantId: room.tenantId,
        judul: draft.judul,
        tenggat: draft.tenggat ? new Date(draft.tenggat).toISOString() : null,
        soal,
      });
      loadedActivities.current.delete(room.id);
      await muatAktivitas(room, true);
      setQuizDrafts((current) => ({
        ...current,
        [room.id]: {
          judul: '',
          tenggat: '',
          soal: [{ pertanyaan: '', pilihanText: '', jawabanBenar: '0' }],
        },
      }));
      setNotice('Kuis berhasil diterbitkan.');
    } catch (saveError) {
      console.error('[ruang-kelas] Gagal menerbitkan kuis:', saveError);
      setActivitiesError((current) => ({
        ...current,
        [room.id]: saveError?.message || 'Kuis tidak dapat diterbitkan.',
      }));
    } finally {
      savingActivities.current.delete(key);
      setActivitySaving((current) => ({ ...current, [key]: false }));
    }
  }

  async function kirimKuis(event, room, quiz) {
    event.preventDefault();
    const key = `quiz-submit:${quiz.id}`;
    if (savingActivities.current.has(key)) return;
    savingActivities.current.add(key);
    setActivitySaving((current) => ({ ...current, [key]: true }));
    setActivitiesError((current) => ({ ...current, [room.id]: '' }));
    try {
      const result = await kirimJawabanKuis(quiz.id, quizAnswers[quiz.id] || []);
      setQuizQuestions((current) => ({ ...current, [quiz.id]: null }));
      setQuizResultsByRoom((current) => ({
        ...current,
        [room.id]: [
          ...(current[room.id] || []).filter((item) => item.quizId !== quiz.id),
          {
            quizId: quiz.id,
            id: result.id,
            userId: user?.uid || '',
            nilai: result.nilai,
            benar: result.benar,
            jumlahSoal: result.jumlahSoal,
            dikirim: new Date().toISOString(),
          },
        ],
      }));
      setNotice(`Kuis selesai. Nilai Anda ${result.nilai}.`);
    } catch (submitError) {
      console.error('[ruang-kelas] Gagal mengirim jawaban kuis:', submitError);
      setActivitiesError((current) => ({
        ...current,
        [room.id]: submitError?.message || 'Jawaban kuis tidak dapat dikirim.',
      }));
    } finally {
      savingActivities.current.delete(key);
      setActivitySaving((current) => ({ ...current, [key]: false }));
    }
  }

  async function simpan(event) {
    event.preventDefault();
    if (!canManage || !targetTenantId || !user?.uid) {
      setError('Hanya operator, admin sekolah, atau superadmin yang dapat membuat ruang kelas.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await buatRuangKelas({ ...form, tenantId: targetTenantId });
      setForm({ ...FORM_AWAL, tahunAjaran: daftarTahunAjaran() });
      setNotice('Ruang kelas berhasil dibuat dan anggota telah ditetapkan.');
      setRefresh((current) => current + 1);
    } catch (saveError) {
      console.error('[ruang-kelas] Gagal membuat ruang kelas:', saveError);
      setError(saveError?.message || 'Ruang kelas tidak dapat dibuat.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="ale-classrooms">
      <header className="ale-classrooms-header">
        <p className="ale-classrooms-kicker">Pembelajaran · LMS</p>
        <h2>Ruang Kelas</h2>
        <p>
          Operator, admin sekolah, atau superadmin membuat ruang kelas dan menetapkan guru
          serta siswa. Guru dan siswa hanya melihat kelas yang ditetapkan untuk akunnya.
        </p>
      </header>

      {isSuperadmin && (
        <label className="ale-classrooms-field">
          Sekolah
          <select
            value={tenantDipilih}
            onChange={(event) => setTenantDipilih(event.currentTarget.value)}
            required
          >
            <option value="">Pilih sekolah aktif</option>
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>{tenant.nama}</option>
            ))}
          </select>
        </label>
      )}

      {error && <p className="ale-classrooms-message is-error" role="alert">{error}</p>}
      {notice && <p className="ale-classrooms-message is-success" role="status">{notice}</p>}

      {canManage && (
        <form className="ale-classrooms-card ale-classrooms-form" onSubmit={simpan}>
          <div>
            <h3>Buat ruang kelas</h3>
            <p>Penetapan anggota berlaku segera. Akun harus aktif di sekolah yang dipilih.</p>
          </div>
          <label className="ale-classrooms-field">
            Nama ruang kelas
            <input
              name="nama"
              value={form.nama}
              onChange={ubahForm}
              minLength={2}
              maxLength={120}
              autoComplete="off"
              required
            />
          </label>
          <div className="ale-classrooms-row ale-classrooms-members">
            <label className="ale-classrooms-field">
              Mata pelajaran
              <input name="mapel" value={form.mapel} onChange={ubahForm} maxLength={120} required />
            </label>
            <label className="ale-classrooms-field">
              Tingkat / rombel
              <input name="tingkat" value={form.tingkat} onChange={ubahForm} maxLength={30} required />
            </label>
            <label className="ale-classrooms-field">
              Tahun ajaran
              <input
                name="tahunAjaran"
                value={form.tahunAjaran}
                onChange={ubahForm}
                minLength={4}
                maxLength={20}
                required
              />
            </label>
          </div>
          <div className="ale-classrooms-row">
            <label className="ale-classrooms-field">
              Guru pengampu
              <select
                multiple
                value={form.guruIds}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  guruIds: pilihanTerpilih(event),
                }))}
                size={Math.min(Math.max(teachers.length, 2), 6)}
                required
              >
                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.nama} · {teacher.role}
                  </option>
                ))}
              </select>
              <small>Pilih satu atau lebih guru. Gunakan Ctrl/Command untuk pilihan ganda.</small>
            </label>
            <label className="ale-classrooms-field">
              Siswa
              <select
                multiple
                value={form.siswaIds}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  siswaIds: pilihanTerpilih(event),
                }))}
                size={Math.min(Math.max(students.length, 2), 6)}
                required
              >
                {students.map((student) => (
                  <option key={student.id} value={student.id}>{student.nama}</option>
                ))}
              </select>
              <small>Pilih minimal satu siswa agar kelas langsung tersedia bagi peserta didik.</small>
            </label>
          </div>
          {(teachers.length === 0 || students.length === 0) && targetTenantId && (
            <p className="ale-classrooms-message" role="status">
              Perlu minimal satu akun guru dan satu akun siswa aktif di sekolah ini. Buat atau aktifkan akun terlebih dahulu.
            </p>
          )}
          <button className="ale-classrooms-submit" type="submit" disabled={
            saving || !targetTenantId || teachers.length === 0 || students.length === 0 ||
            form.guruIds.length === 0 || form.siswaIds.length === 0
          }>
            {saving ? 'Membuat ruang kelas…' : 'Buat ruang kelas'}
          </button>
        </form>
      )}

      <section className="ale-classrooms-list" aria-labelledby="classrooms-list-title">
        <div className="ale-classrooms-list-heading">
          <div>
            <p className="ale-classrooms-kicker">Daftar kelas</p>
            <h3 id="classrooms-list-title">{canManage ? 'Ruang kelas sekolah' : 'Kelas saya'}</h3>
          </div>
          {canManage && <span>{rooms.length} ruang kelas</span>}
        </div>
        {loading ? (
          <p role="status">Memuat ruang kelas…</p>
        ) : !targetTenantId ? (
          <p className="ale-classrooms-empty" role="status">Pilih sekolah untuk melihat ruang kelas.</p>
        ) : rooms.length === 0 ? (
          <p className="ale-classrooms-empty" role="status">
            {canManage
              ? 'Belum ada ruang kelas. Buat ruang kelas pertama di formulir ini.'
              : 'Belum ada kelas yang ditetapkan ke akun Anda. Hubungi operator sekolah.'}
          </p>
        ) : (
          <div className="ale-classrooms-grid">
            {rooms.map((room) => {
              const draft = materialDrafts[room.id] || { judul: '', isi: '' };
              const roomAttendanceSessions = attendanceSessions[room.id] || [];
              const roomAttendanceRecords = attendanceRecords[room.id] || [];
              const roomAttendanceRoster = attendanceRoster[room.id] || [];
              const chosenAttendanceSession = roomAttendanceSessions.find(
                (session) => session.id === selectedAttendanceSession[room.id],
              );
              const chosenAttendanceDraft = chosenAttendanceSession
                ? attendanceDrafts[chosenAttendanceSession.id] || {}
                : {};
              return (
                <details
                  className="ale-classrooms-card ale-classrooms-room"
                  id={`ruang-kelas-${room.id}`}
                  key={room.id}
                  onToggle={(event) => {
                    if (event.currentTarget.open) {
                      void muatMateri(room);
                      void muatAktivitas(room);
                    }
                  }}
                >
                  <summary className="ale-classrooms-room-summary">
                    <span className="ale-classrooms-room-icon" aria-hidden="true">
                      <i className="bi bi-journal-bookmark-fill" />
                    </span>
                    <span>
                      <strong>{room.nama}</strong>
                      <span>{[room.mapel, room.tingkat].filter(Boolean).join(' · ') || 'Kelas pembelajaran'}</span>
                      <small>Tahun ajaran {room.tahunAjaran}</small>
                    </span>
                  </summary>
                  <div className="ale-classrooms-materials">
                    <h4>Materi kelas</h4>
                    {materialsLoading[room.id] ? (
                      <p role="status">Memuat materi…</p>
                    ) : materialsError[room.id] ? (
                      <p className="ale-classrooms-message is-error" role="alert">
                        {materialsError[room.id]}
                        <button type="button" onClick={() => {
                          loadedMaterials.current.delete(room.id);
                          void muatMateri(room);
                        }}>Coba lagi</button>
                      </p>
                    ) : (materialsByRoom[room.id] || []).length === 0 ? (
                      <p className="ale-classrooms-empty">Belum ada materi di kelas ini.</p>
                    ) : (
                      <ul className="ale-classrooms-material-list">
                        {(materialsByRoom[room.id] || []).map((material) => (
                          <li key={material.id}>
                            <h5>{material.judul}</h5>
                            <p>{material.isi}</p>
                            <time dateTime={material.dibuat}>
                              {new Intl.DateTimeFormat('id-ID', {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              }).format(new Date(material.dibuat))}
                            </time>
                          </li>
                        ))}
                      </ul>
                    )}
                    {bolehKelolaAktivitasKelas(role) && (
                      <form
                        className="ale-classrooms-material-form"
                        onSubmit={(event) => void simpanMateri(event, room)}
                      >
                        <label className="ale-classrooms-field">
                          Judul materi
                          <input
                            value={draft.judul}
                            onChange={(event) => ubahDraftMateri(room.id, 'judul', event.currentTarget.value)}
                            maxLength={120}
                            required
                          />
                        </label>
                        <label className="ale-classrooms-field">
                          Isi materi
                          <textarea
                            value={draft.isi}
                            onChange={(event) => ubahDraftMateri(room.id, 'isi', event.currentTarget.value)}
                            maxLength={20000}
                            rows={5}
                            required
                          />
                        </label>
                        <button
                          className="ale-classrooms-submit"
                          type="submit"
                          disabled={Boolean(materialsSaving[room.id])}
                        >
                          {materialsSaving[room.id] ? 'Menerbitkan…' : 'Terbitkan materi'}
                        </button>
                      </form>
                    )}
                  </div>
                  <div className="ale-classrooms-materials">
                    <h4>Tugas</h4>
                    {activitiesLoading[room.id] ? (
                      <p role="status">Memuat aktivitas kelas…</p>
                    ) : activitiesError[room.id] ? (
                      <p className="ale-classrooms-message is-error" role="alert">
                        {activitiesError[room.id]}
                        <button type="button" onClick={() => {
                          loadedActivities.current.delete(room.id);
                          void muatAktivitas(room, true);
                        }}>Coba lagi</button>
                      </p>
                    ) : (assignmentsByRoom[room.id] || []).length === 0 ? (
                      <p className="ale-classrooms-empty">Belum ada tugas di kelas ini.</p>
                    ) : (
                      <ul className="ale-classrooms-assignment-list">
                        {(assignmentsByRoom[room.id] || []).map((assignment) => {
                          const submissions = submissionsByRoom[room.id] || [];
                          const ownSubmission = submissions.find((submission) =>
                            submission.assignmentId === assignment.id && submission.userId === user?.uid);
                          const classSubmissions = submissions.filter((submission) =>
                            submission.assignmentId === assignment.id);
                          const isPastDue = assignment.tenggat &&
                            Date.parse(assignment.tenggat) <= Date.now();
                          return (
                            <li id={`ruang-aktivitas-${assignment.id}`} key={assignment.id}>
                              <h5>{assignment.judul}</h5>
                              <p>{assignment.instruksi}</p>
                              <small>
                                Tenggat:{' '}
                                {assignment.tenggat
                                  ? new Intl.DateTimeFormat('id-ID', {
                                    dateStyle: 'medium',
                                    timeStyle: 'short',
                                  }).format(new Date(assignment.tenggat))
                                  : 'Tidak ada'}
                              </small>
                              {role === 'siswa' && (
                                <div className="ale-classrooms-assignment-response">
                                  {ownSubmission?.nilai !== null && ownSubmission?.nilai !== undefined ? (
                                    <p className="ale-classrooms-message is-success" role="status">
                                      Nilai: {ownSubmission.nilai}
                                      {ownSubmission.umpanBalik ? ` · ${ownSubmission.umpanBalik}` : ''}
                                    </p>
                                  ) : null}
                                  {ownSubmission && ownSubmission.nilai === null && (
                                    <p role="status">
                                      Jawaban terkirim pada{' '}
                                      {new Intl.DateTimeFormat('id-ID', {
                                        dateStyle: 'medium',
                                        timeStyle: 'short',
                                      }).format(new Date(ownSubmission.dikirim))}
                                    </p>
                                  )}
                                  {!isPastDue && ownSubmission?.nilai == null && (
                                    <form
                                      className="ale-classrooms-material-form"
                                      onSubmit={(event) => void kirimTugas(event, room, assignment)}
                                    >
                                      <label className="ale-classrooms-field">
                                        {ownSubmission ? 'Perbarui jawaban' : 'Jawaban'}
                                        <textarea
                                          value={answerDrafts[assignment.id] ?? ownSubmission?.jawaban ?? ''}
                                          onChange={(event) => setAnswerDrafts((current) => ({
                                            ...current,
                                            [assignment.id]: event.currentTarget.value,
                                          }))}
                                          maxLength={20000}
                                          rows={4}
                                          required
                                        />
                                      </label>
                                      <button
                                        className="ale-classrooms-submit"
                                        type="submit"
                                        disabled={Boolean(activitySaving[`submit:${assignment.id}`])}
                                      >
                                        {activitySaving[`submit:${assignment.id}`]
                                          ? 'Mengirim…'
                                          : ownSubmission ? 'Perbarui jawaban' : 'Kirim jawaban'}
                                      </button>
                                    </form>
                                  )}
                                  {isPastDue && !ownSubmission && (
                                    <p className="ale-classrooms-message">Tenggat pengumpulan sudah lewat.</p>
                                  )}
                                </div>
                              )}
                              {bolehKelolaAktivitasKelas(role) && (
                                <div className="ale-classrooms-submissions">
                                  <h6>Pengumpulan ({classSubmissions.length})</h6>
                                  {classSubmissions.length === 0 ? (
                                    <p className="ale-classrooms-empty">Belum ada jawaban yang dikirim.</p>
                                  ) : classSubmissions.map((submission) => {
                                    const gradeDraft = gradeDrafts[submission.id] || {
                                      nilai: submission.nilai ?? '',
                                      umpanBalik: submission.umpanBalik || '',
                                    };
                                    return (
                                      <article className="ale-classrooms-submission" key={submission.id}>
                                        <strong>{submission.namaSiswa || 'Siswa'}</strong>
                                        <p>{submission.jawaban}</p>
                                        <small>
                                          Dikirim{' '}
                                          {new Intl.DateTimeFormat('id-ID', {
                                            dateStyle: 'medium',
                                            timeStyle: 'short',
                                          }).format(new Date(submission.dikirim))}
                                        </small>
                                        <form
                                          className="ale-classrooms-grade-form"
                                          onSubmit={(event) => void nilaiTugas(event, room, submission)}
                                        >
                                          <label className="ale-classrooms-field">
                                            Nilai (0–100)
                                            <input
                                              type="number"
                                              min="0"
                                              max="100"
                                              step="0.01"
                                              value={gradeDraft.nilai}
                                              onChange={(event) => ubahDraftAktivitas(
                                                setGradeDrafts,
                                                submission.id,
                                                'nilai',
                                                event.currentTarget.value,
                                              )}
                                              required
                                            />
                                          </label>
                                          <label className="ale-classrooms-field">
                                            Umpan balik
                                            <textarea
                                              value={gradeDraft.umpanBalik}
                                              onChange={(event) => ubahDraftAktivitas(
                                                setGradeDrafts,
                                                submission.id,
                                                'umpanBalik',
                                                event.currentTarget.value,
                                              )}
                                              maxLength={2000}
                                              rows={2}
                                            />
                                          </label>
                                          <button
                                            className="ale-classrooms-submit"
                                            type="submit"
                                            disabled={Boolean(activitySaving[`grade:${submission.id}`])}
                                          >
                                            {activitySaving[`grade:${submission.id}`]
                                              ? 'Menyimpan…'
                                              : submission.nilai === null ? 'Simpan nilai' : 'Perbarui nilai'}
                                          </button>
                                        </form>
                                      </article>
                                    );
                                  })}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {bolehKelolaAktivitasKelas(role) && (
                      <form
                        className="ale-classrooms-material-form"
                        onSubmit={(event) => void simpanTugas(event, room)}
                      >
                        <h5>Buat tugas</h5>
                        <label className="ale-classrooms-field">
                          Judul tugas
                          <input
                            value={assignmentDrafts[room.id]?.judul || ''}
                            onChange={(event) => ubahDraftAktivitas(
                              setAssignmentDrafts,
                              room.id,
                              'judul',
                              event.currentTarget.value,
                            )}
                            maxLength={120}
                            required
                          />
                        </label>
                        <label className="ale-classrooms-field">
                          Instruksi
                          <textarea
                            value={assignmentDrafts[room.id]?.instruksi || ''}
                            onChange={(event) => ubahDraftAktivitas(
                              setAssignmentDrafts,
                              room.id,
                              'instruksi',
                              event.currentTarget.value,
                            )}
                            maxLength={20000}
                            rows={4}
                            required
                          />
                        </label>
                        <label className="ale-classrooms-field">
                          Tenggat (opsional)
                          <input
                            type="datetime-local"
                            value={assignmentDrafts[room.id]?.tenggat || ''}
                            onChange={(event) => ubahDraftAktivitas(
                              setAssignmentDrafts,
                              room.id,
                              'tenggat',
                              event.currentTarget.value,
                            )}
                          />
                        </label>
                        <button
                          className="ale-classrooms-submit"
                          type="submit"
                          disabled={Boolean(activitySaving[`assignment:${room.id}`])}
                        >
                          {activitySaving[`assignment:${room.id}`]
                            ? 'Menerbitkan…'
                            : 'Terbitkan tugas'}
                        </button>
                      </form>
                    )}
                  </div>
                  <div className="ale-classrooms-materials">
                    <h4>Kuis pilihan ganda</h4>
                    {(quizzesByRoom[room.id] || []).length === 0 ? (
                      <p className="ale-classrooms-empty">Belum ada kuis di kelas ini.</p>
                    ) : (
                      <ul className="ale-classrooms-assignment-list">
                        {(quizzesByRoom[room.id] || []).map((quiz) => {
                          const results = quizResultsByRoom[room.id] || [];
                          const ownResult = results.find((result) =>
                            result.quizId === quiz.id && result.userId === user?.uid);
                          const quizResultRows = results.filter((result) => result.quizId === quiz.id);
                          const expired = quiz.tenggat && Date.parse(quiz.tenggat) <= Date.now();
                          const questions = quizQuestions[quiz.id];
                          return (
                            <li id={`ruang-aktivitas-${quiz.id}`} key={quiz.id}>
                              <h5>{quiz.judul}</h5>
                              <small>
                                Tenggat:{' '}
                                {quiz.tenggat
                                  ? new Intl.DateTimeFormat('id-ID', {
                                    dateStyle: 'medium',
                                    timeStyle: 'short',
                                  }).format(new Date(quiz.tenggat))
                                  : 'Tidak ada'}
                              </small>
                              {role === 'siswa' && ownResult ? (
                                <p className="ale-classrooms-message is-success" role="status">
                                  Nilai {ownResult.nilai} · {ownResult.benar}/{ownResult.jumlahSoal} benar
                                </p>
                              ) : role === 'siswa' && !expired ? (
                                questions ? (
                                  <form
                                    className="ale-classrooms-quiz-form"
                                    onSubmit={(event) => void kirimKuis(event, room, quiz)}
                                  >
                                    {questions.map((question, questionIndex) => (
                                      <fieldset className="ale-classrooms-quiz-question" key={question.id}>
                                        <legend>{questionIndex + 1}. {question.pertanyaan}</legend>
                                        {question.pilihan.map((choice, choiceIndex) => (
                                          <label key={`${question.id}-${choiceIndex}`}>
                                            <input
                                              type="radio"
                                              name={`quiz-${quiz.id}-${question.id}`}
                                              value={choiceIndex}
                                              checked={quizAnswers[quiz.id]?.[questionIndex] === choiceIndex}
                                              onChange={() => setQuizAnswers((current) => ({
                                                ...current,
                                                [quiz.id]: (current[quiz.id] || []).map((answer, index) =>
                                                  index === questionIndex ? choiceIndex : answer),
                                              }))}
                                              required
                                            />
                                            {choice}
                                          </label>
                                        ))}
                                      </fieldset>
                                    ))}
                                    <button
                                      className="ale-classrooms-submit"
                                      type="submit"
                                      disabled={Boolean(activitySaving[`quiz-submit:${quiz.id}`]) ||
                                        (quizAnswers[quiz.id] || []).some((answer) => answer === null)}
                                    >
                                      {activitySaving[`quiz-submit:${quiz.id}`] ? 'Mengirim…' : 'Kirim jawaban kuis'}
                                    </button>
                                  </form>
                                ) : (
                                  <button
                                    className="ale-classrooms-submit"
                                    type="button"
                                    disabled={Boolean(quizLoading[quiz.id])}
                                    onClick={() => void mulaiKuis(quiz)}
                                  >
                                    {quizLoading[quiz.id] ? 'Memuat soal…' : 'Mulai kuis'}
                                  </button>
                                )
                              ) : role === 'siswa' ? (
                                <p className="ale-classrooms-message">Tenggat kuis sudah lewat.</p>
                              ) : bolehKelolaAktivitasKelas(role) ? (
                                <div className="ale-classrooms-submissions">
                                  <h6>Hasil siswa ({quizResultRows.length})</h6>
                                  {quizResultRows.map((result) => (
                                    <p className="ale-classrooms-quiz-result" key={result.id}>
                                      <strong>{result.namaSiswa || 'Siswa'}</strong>
                                      {' · '}{result.nilai} ({result.benar}/{result.jumlahSoal})
                                    </p>
                                  ))}
                                </div>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {bolehKelolaAktivitasKelas(role) && (
                      <form
                        className="ale-classrooms-material-form"
                        onSubmit={(event) => void terbitkanKuis(event, room)}
                      >
                        <h5>Buat kuis</h5>
                        <label className="ale-classrooms-field">
                          Judul kuis
                          <input
                            value={quizDrafts[room.id]?.judul || ''}
                            onChange={(event) => ubahDraftAktivitas(
                              setQuizDrafts,
                              room.id,
                              'judul',
                              event.currentTarget.value,
                            )}
                            maxLength={120}
                            required
                          />
                        </label>
                        <label className="ale-classrooms-field">
                          Tenggat (opsional)
                          <input
                            type="datetime-local"
                            value={quizDrafts[room.id]?.tenggat || ''}
                            onChange={(event) => ubahDraftAktivitas(
                              setQuizDrafts,
                              room.id,
                              'tenggat',
                              event.currentTarget.value,
                            )}
                          />
                        </label>
                        {(quizDrafts[room.id] || draftKuisAwal()).soal.map((question, questionIndex) => {
                          const options = question.pilihanText.split('\n')
                            .map((choice) => choice.trim()).filter(Boolean);
                          return (
                            <fieldset className="ale-classrooms-quiz-question" key={questionIndex}>
                              <legend>Soal {questionIndex + 1}</legend>
                              <label className="ale-classrooms-field">
                                Pertanyaan
                                <textarea
                                  value={question.pertanyaan}
                                  onChange={(event) => ubahSoalKuis(
                                    room.id,
                                    questionIndex,
                                    { pertanyaan: event.currentTarget.value },
                                  )}
                                  maxLength={2000}
                                  rows={2}
                                  required
                                />
                              </label>
                              <label className="ale-classrooms-field">
                                Pilihan jawaban (satu pilihan per baris, 2–6 pilihan)
                                <textarea
                                  value={question.pilihanText}
                                  onChange={(event) => ubahSoalKuis(
                                    room.id,
                                    questionIndex,
                                    { pilihanText: event.currentTarget.value },
                                  )}
                                  rows={4}
                                  required
                                />
                              </label>
                              <label className="ale-classrooms-field">
                                Kunci jawaban
                                <select
                                  value={question.jawabanBenar}
                                  onChange={(event) => ubahSoalKuis(
                                    room.id,
                                    questionIndex,
                                    { jawabanBenar: event.currentTarget.value },
                                  )}
                                  required
                                >
                                  {options.map((option, optionIndex) => (
                                    <option key={optionIndex} value={optionIndex}>
                                      {optionIndex + 1}. {option}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              {(quizDrafts[room.id] || draftKuisAwal()).soal.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => hapusSoalKuis(room.id, questionIndex)}
                                >
                                  Hapus soal
                                </button>
                              )}
                            </fieldset>
                          );
                        })}
                        {(quizDrafts[room.id] || draftKuisAwal()).soal.length < 50 && (
                          <button
                            type="button"
                            onClick={() => tambahSoalKuis(room.id)}
                          >
                            Tambah soal
                          </button>
                        )}
                        <button
                          className="ale-classrooms-submit"
                          type="submit"
                          disabled={Boolean(activitySaving[`quiz:${room.id}`])}
                        >
                          {activitySaving[`quiz:${room.id}`] ? 'Menerbitkan…' : 'Terbitkan kuis'}
                        </button>
                      </form>
                    )}
                  </div>
                  <section className="ale-classrooms-materials" aria-label="Presensi kelas">
                    <h4>Presensi kelas</h4>
                    {bolehKelolaAktivitasKelas(role) ? (
                      <>
                        <form
                          className="ale-classrooms-attendance-form"
                          onSubmit={(event) => void buatSesiPresensi(event, room)}
                        >
                          <h5>Buat sesi presensi</h5>
                          <div className="ale-classrooms-row ale-classrooms-members">
                            <label className="ale-classrooms-field">
                              Tanggal
                              <input
                                type="date"
                                value={attendanceSessionDrafts[room.id]?.tanggal || tanggalHariIni()}
                                onChange={(event) => ubahDraftAktivitas(
                                  setAttendanceSessionDrafts,
                                  room.id,
                                  'tanggal',
                                  event.currentTarget.value,
                                )}
                                required
                              />
                            </label>
                            <label className="ale-classrooms-field">
                              Judul sesi
                              <input
                                value={attendanceSessionDrafts[room.id]?.judul || 'Presensi kelas'}
                                onChange={(event) => ubahDraftAktivitas(
                                  setAttendanceSessionDrafts,
                                  room.id,
                                  'judul',
                                  event.currentTarget.value,
                                )}
                                maxLength={120}
                                required
                              />
                            </label>
                          </div>
                          <button
                            className="ale-classrooms-submit"
                            type="submit"
                            disabled={Boolean(activitySaving[`attendance-session:${room.id}`])}
                          >
                            {activitySaving[`attendance-session:${room.id}`]
                              ? 'Membuat sesi…'
                              : 'Buat / buka sesi'}
                          </button>
                        </form>
                        {roomAttendanceSessions.length === 0 ? (
                          <p className="ale-classrooms-empty">Belum ada sesi presensi di kelas ini.</p>
                        ) : (
                          <>
                            <label className="ale-classrooms-field">
                              Pilih sesi
                              <select
                                value={chosenAttendanceSession?.id || ''}
                                onChange={(event) => pilihSesiPresensi(room, event.currentTarget.value)}
                              >
                                {roomAttendanceSessions.map((session) => (
                                  <option key={session.id} value={session.id}>
                                    {session.tanggal} · {session.judul}
                                  </option>
                                ))}
                              </select>
                            </label>
                            {chosenAttendanceSession && (
                              <form
                                className="ale-classrooms-attendance-form"
                                onSubmit={(event) => void simpanPresensi(
                                  event,
                                  room,
                                  chosenAttendanceSession,
                                )}
                              >
                                <h5>{chosenAttendanceSession.judul} · {chosenAttendanceSession.tanggal}</h5>
                                {roomAttendanceRoster.length === 0 ? (
                                  <p className="ale-classrooms-empty">
                                    Tidak ada siswa aktif yang terdaftar di kelas ini.
                                  </p>
                                ) : (
                                  <div className="ale-classrooms-attendance-list">
                                    {roomAttendanceRoster.map((student) => {
                                      const studentDraft = chosenAttendanceDraft[student.id] || {
                                        status: '',
                                        note: '',
                                      };
                                      return (
                                        <div
                                          className="ale-classrooms-attendance-row"
                                          key={student.id}
                                        >
                                          <strong>{student.nama}</strong>
                                          <label className="ale-classrooms-field">
                                            Status
                                            <select
                                              value={studentDraft.status}
                                              onChange={(event) => ubahDraftPresensi(
                                                chosenAttendanceSession.id,
                                                student.id,
                                                'status',
                                                event.currentTarget.value,
                                              )}
                                              required
                                            >
                                              <option value="">Pilih status</option>
                                              <option value="hadir">Hadir</option>
                                              <option value="izin">Izin</option>
                                              <option value="sakit">Sakit</option>
                                              <option value="alpa">Alpa</option>
                                            </select>
                                          </label>
                                          <label className="ale-classrooms-field">
                                            Catatan (opsional)
                                            <input
                                              value={studentDraft.note}
                                              maxLength={500}
                                              onChange={(event) => ubahDraftPresensi(
                                                chosenAttendanceSession.id,
                                                student.id,
                                                'note',
                                                event.currentTarget.value,
                                              )}
                                            />
                                          </label>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                                <button
                                  className="ale-classrooms-submit"
                                  type="submit"
                                  disabled={roomAttendanceRoster.length === 0 ||
                                    roomAttendanceRoster.some((student) =>
                                      !STATUS_PRESENSI.includes(
                                        chosenAttendanceDraft[student.id]?.status,
                                      )) ||
                                    Boolean(activitySaving[`attendance:${chosenAttendanceSession.id}`])}
                                >
                                  {activitySaving[`attendance:${chosenAttendanceSession.id}`]
                                    ? 'Menyimpan…'
                                    : 'Simpan presensi lengkap'}
                                </button>
                              </form>
                            )}
                          </>
                        )}
                      </>
                    ) : role === 'siswa' ? (
                      roomAttendanceRecords.filter((record) => record.studentId === user?.uid).length
                        ? (
                          <ul className="ale-classrooms-attendance-history">
                            {roomAttendanceSessions
                              .map((session) => ({
                                session,
                                record: roomAttendanceRecords.find((item) =>
                                  item.sessionId === session.id && item.studentId === user?.uid),
                              }))
                              .filter(({ record }) => record)
                              .map(({ session, record }) => (
                                <li key={session.id}>
                                  <strong>{session.tanggal} · {session.judul}</strong>
                                  <span>Status: {record.status}</span>
                                  {record.catatan && <small>Catatan: {record.catatan}</small>}
                                </li>
                              ))}
                          </ul>
                        ) : (
                          <p className="ale-classrooms-empty">Belum ada riwayat presensi untuk Anda.</p>
                        )
                    ) : (
                      <p className="ale-classrooms-empty">
                        Presensi hanya tersedia untuk guru kelas dan riwayat pribadi siswa.
                      </p>
                    )}
                  </section>
                </details>
              );
            })}
          </div>
        )}
      </section>
      <p className="ale-classrooms-footnote">
        Materi, tugas teks, kuis pilihan ganda, dan presensi kelas tersedia untuk anggota kelas.
        Nilai kuis dihitung di database tanpa membagikan kunci jawaban kepada siswa. Lampiran
        berkas dan notifikasi LMS belum tersedia. Siswa hanya dapat melihat riwayat presensi
        pribadi.
      </p>
    </main>
  );
}
