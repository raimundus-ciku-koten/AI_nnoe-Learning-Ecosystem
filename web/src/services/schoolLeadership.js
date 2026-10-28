import { supabase } from '../lib/supabase.ts';

function requireRows(data, description, validateRow) {
  if (!Array.isArray(data) || data.some((row) => !validateRow(row))) {
    throw new Error(`Supabase mengembalikan ${description} yang tidak valid.`);
  }
  return data;
}

function nullableNumber(value) {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function nullableScore(value) {
  return nullableNumber(value) && (value === null || (value >= 0 && value <= 100));
}

function validPrincipalSummary(row) {
  return row && [
    'classroom_count',
    'student_count',
    'attendance_records',
    'graded_submissions',
    'quiz_submissions',
  ].every((field) => Number.isInteger(row[field]) && row[field] >= 0)
    && ['attendance_rate', 'assignment_average', 'quiz_average'].every((field) =>
      nullableScore(row[field]));
}

function validClassroom(row) {
  return row && typeof row.classroom_id === 'string'
    && typeof row.classroom_name === 'string'
    && (row.grade === null || typeof row.grade === 'string')
    && typeof row.academic_year === 'string';
}

export async function muatRingkasanKepalaSekolah() {
  const { data, error } = await supabase.rpc('learning_school_principal_summary');
  if (error) throw error;
  const rows = requireRows(data, 'ringkasan sekolah', validPrincipalSummary);
  if (rows.length !== 1) throw new Error('Ringkasan sekolah tidak tersedia.');
  return {
    jumlahKelas: rows[0].classroom_count,
    jumlahSiswa: rows[0].student_count,
    jumlahCatatanPresensi: rows[0].attendance_records,
    persentaseHadir: rows[0].attendance_rate,
    pengumpulanDinilai: rows[0].graded_submissions,
    rataNilaiTugas: rows[0].assignment_average,
    kuisDikerjakan: rows[0].quiz_submissions,
    rataNilaiKuis: rows[0].quiz_average,
  };
}

export async function muatKelasWali() {
  const { data, error } = await supabase.rpc('learning_classroom_homeroom_classes');
  if (error) throw error;
  return requireRows(data, 'daftar kelas wali', validClassroom).map((row) => ({
    id: row.classroom_id,
    nama: row.classroom_name,
    tingkat: row.grade || '',
    tahunAjaran: row.academic_year,
  }));
}

export async function muatLaporanKelasWali(classroomId) {
  if (typeof classroomId !== 'string' || !classroomId.trim()) {
    throw new TypeError('Pilih kelas yang ditugaskan kepada Anda.');
  }
  const { data, error } = await supabase.rpc('learning_classroom_homeroom_report', {
    p_classroom_id: classroomId,
  });
  if (error) throw error;
  const rows = requireRows(data, 'ringkasan siswa kelas', (row) =>
    row && typeof row.student_id === 'string'
      && typeof row.student_name === 'string'
      && [
        'attendance_sessions', 'hadir', 'izin', 'sakit', 'alpa',
        'graded_assignments', 'completed_quizzes',
      ].every((field) => Number.isInteger(row[field]) && row[field] >= 0)
      && nullableScore(row.assignment_average)
      && nullableScore(row.quiz_average));
  return rows.map((row) => ({
    id: row.student_id,
    nama: row.student_name,
    presensi: {
      sesi: row.attendance_sessions,
      hadir: row.hadir,
      izin: row.izin,
      sakit: row.sakit,
      alpa: row.alpa,
    },
    tugasDinilai: row.graded_assignments,
    rataNilaiTugas: row.assignment_average,
    kuisDikerjakan: row.completed_quizzes,
    rataNilaiKuis: row.quiz_average,
  }));
}

export async function muatKandidatWaliKelas(tenantId) {
  if (typeof tenantId !== 'string' || !tenantId.trim()) {
    throw new TypeError('Sekolah aktif tidak tersedia.');
  }
  const { data, error } = await supabase.rpc('learning_classroom_homeroom_candidates', {
    p_tenant_id: tenantId,
  });
  if (error) throw error;
  return requireRows(data, 'daftar kandidat wali kelas', (row) =>
    row && typeof row.id === 'string' && typeof row.nama === 'string')
    .map(({ id, nama }) => ({ id, nama }));
}

export async function muatPenugasanWaliKelas(tenantId) {
  if (typeof tenantId !== 'string' || !tenantId.trim()) {
    throw new TypeError('Sekolah aktif tidak tersedia.');
  }
  const { data, error } = await supabase.rpc('learning_classroom_homeroom_admin_list', {
    p_tenant_id: tenantId,
  });
  if (error) throw error;
  return requireRows(data, 'daftar penugasan wali kelas', (row) =>
    validClassroom(row)
      && (row.homeroom_user_id === null || typeof row.homeroom_user_id === 'string')
      && (row.homeroom_name === null || typeof row.homeroom_name === 'string'))
    .map((row) => ({
      id: row.classroom_id,
      nama: row.classroom_name,
      tingkat: row.grade || '',
      tahunAjaran: row.academic_year,
      waliId: row.homeroom_user_id,
      waliNama: row.homeroom_name,
    }));
}

export async function tetapkanWaliKelas(classroomId, userId) {
  if (typeof classroomId !== 'string' || !classroomId.trim()
      || (userId !== null && (typeof userId !== 'string' || !userId.trim()))) {
    throw new TypeError('Kelas atau akun wali kelas tidak valid.');
  }
  const { error } = await supabase.rpc('assign_learning_classroom_homeroom', {
    p_classroom_id: classroomId,
    p_user_id: userId,
  });
  if (error) throw error;
}
