import { supabase } from '../lib/supabase.ts';

export const PERAN_GURU_KELAS = [
  'guru',
  'guru_bk',
  'guru_kokurikuler',
  'guru_ekstrakurikuler',
];

export function ringkasNilaiKuis(hasil) {
  if (!Array.isArray(hasil) ||
      hasil.some((item) => !item || !Number.isFinite(item.nilai) ||
        item.nilai < 0 || item.nilai > 100)) {
    throw new TypeError('Daftar nilai kuis tidak valid.');
  }
  return {
    rataRata: hasil.length
      ? Math.round(hasil.reduce((total, item) => total + item.nilai, 0) / hasil.length)
      : null,
    jumlahHasil: hasil.length,
  };
}

function validasiTenantId(tenantId) {
  if (typeof tenantId !== 'string' || !tenantId.trim()) {
    throw new Error('Pilih sekolah aktif sebelum membuka Ruang Kelas.');
  }
}

function validasiDaftarId(ids, label, wajib = false) {
  if (!Array.isArray(ids) || (wajib && ids.length === 0) ||
      ids.length > 1000 ||
      ids.some((id) => typeof id !== 'string' || !id.trim()) ||
      new Set(ids).size !== ids.length) {
    throw new TypeError(`Daftar ${label} tidak valid.`);
  }
}

function dariBarisRuangKelas(row) {
  if (!row || typeof row.id !== 'string' ||
      typeof row.tenant_id !== 'string' ||
      typeof row.name !== 'string' ||
      typeof row.academic_year !== 'string' ||
      typeof row.created_by !== 'string' ||
      typeof row.created_at !== 'string' ||
      (row.subject !== null && typeof row.subject !== 'string') ||
      (row.grade !== null && typeof row.grade !== 'string') ||
      !Number.isFinite(Date.parse(row.created_at))) {
    throw new Error('Supabase mengembalikan data Ruang Kelas yang tidak valid.');
  }
  return {
    id: row.id,
    tenantId: row.tenant_id,
    nama: row.name,
    mapel: row.subject || '',
    tingkat: row.grade || '',
    tahunAjaran: row.academic_year,
    dibuat: row.created_at,
  };
}

function dariBarisMateri(row) {
  if (!row || typeof row.id !== 'string' ||
      typeof row.classroom_id !== 'string' ||
      typeof row.tenant_id !== 'string' ||
      typeof row.title !== 'string' ||
      typeof row.content !== 'string' ||
      typeof row.created_by !== 'string' ||
      typeof row.created_at !== 'string' ||
      !Number.isFinite(Date.parse(row.created_at))) {
    throw new Error('Supabase mengembalikan data materi yang tidak valid.');
  }
  return {
    id: row.id,
    classroomId: row.classroom_id,
    tenantId: row.tenant_id,
    judul: row.title,
    isi: row.content,
    dibuatOleh: row.created_by,
    dibuat: row.created_at,
  };
}

function dariBarisTugas(row) {
  if (!row || typeof row.id !== 'string' ||
      typeof row.classroom_id !== 'string' ||
      typeof row.tenant_id !== 'string' ||
      typeof row.title !== 'string' ||
      typeof row.instructions !== 'string' ||
      typeof row.created_by !== 'string' ||
      typeof row.created_at !== 'string' ||
      !Number.isFinite(Date.parse(row.created_at)) ||
      (row.due_at !== null && (
        typeof row.due_at !== 'string' || !Number.isFinite(Date.parse(row.due_at))
      ))) {
    throw new Error('Supabase mengembalikan data tugas yang tidak valid.');
  }
  return {
    id: row.id,
    classroomId: row.classroom_id,
    tenantId: row.tenant_id,
    judul: row.title,
    instruksi: row.instructions,
    tenggat: row.due_at,
    dibuatOleh: row.created_by,
    dibuat: row.created_at,
  };
}

function dariBarisPengumpulan(row) {
  if (!row || typeof row.id !== 'string' ||
      typeof row.assignment_id !== 'string' ||
      typeof row.user_id !== 'string' ||
      typeof row.answer !== 'string' ||
      typeof row.submitted_at !== 'string' ||
      !Number.isFinite(Date.parse(row.submitted_at)) ||
      (row.score !== null && (!Number.isFinite(Number(row.score)) ||
        Number(row.score) < 0 || Number(row.score) > 100)) ||
      (row.feedback !== null && typeof row.feedback !== 'string') ||
      (row.graded_at !== null && (
        typeof row.graded_at !== 'string' || !Number.isFinite(Date.parse(row.graded_at))
      ))) {
    throw new Error('Supabase mengembalikan data pengumpulan tugas yang tidak valid.');
  }
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    userId: row.user_id,
    namaSiswa: typeof row.student_name === 'string' ? row.student_name : '',
    jawaban: row.answer,
    dikirim: row.submitted_at,
    nilai: row.score === null ? null : Number(row.score),
    umpanBalik: row.feedback || '',
    dinilai: row.graded_at,
  };
}

function dariBarisKuis(row) {
  if (!row || typeof row.id !== 'string' ||
      typeof row.classroom_id !== 'string' ||
      typeof row.tenant_id !== 'string' ||
      typeof row.title !== 'string' ||
      typeof row.created_by !== 'string' ||
      typeof row.created_at !== 'string' ||
      !Number.isFinite(Date.parse(row.created_at)) ||
      (row.due_at !== null && (
        typeof row.due_at !== 'string' || !Number.isFinite(Date.parse(row.due_at))
      ))) {
    throw new Error('Supabase mengembalikan data kuis yang tidak valid.');
  }
  return {
    id: row.id,
    classroomId: row.classroom_id,
    tenantId: row.tenant_id,
    judul: row.title,
    tenggat: row.due_at,
    dibuatOleh: row.created_by,
    dibuat: row.created_at,
  };
}

function dariBarisSoalKuis(row) {
  if (!row || typeof row.question_id !== 'string' ||
      !Number.isInteger(row.position) ||
      typeof row.prompt !== 'string' ||
      !Array.isArray(row.choices) ||
      row.choices.length < 2 || row.choices.length > 6 ||
      row.choices.some((choice) => typeof choice !== 'string')) {
    throw new Error('Supabase mengembalikan soal kuis yang tidak valid.');
  }
  return {
    id: row.question_id,
    urutan: row.position,
    pertanyaan: row.prompt,
    pilihan: row.choices,
  };
}

function dariBarisHasilKuis(row) {
  if (!row || typeof row.quiz_id !== 'string' ||
      typeof row.submission_id !== 'string' ||
      typeof row.user_id !== 'string' ||
      !Number.isFinite(Number(row.score)) ||
      !Number.isInteger(row.correct_count) ||
      !Number.isInteger(row.question_count) ||
      typeof row.submitted_at !== 'string' ||
      !Number.isFinite(Date.parse(row.submitted_at))) {
    throw new Error('Supabase mengembalikan hasil kuis yang tidak valid.');
  }
  return {
    quizId: row.quiz_id,
    id: row.submission_id,
    userId: row.user_id,
    namaSiswa: typeof row.student_name === 'string' ? row.student_name : '',
    nilai: Number(row.score),
    benar: row.correct_count,
    jumlahSoal: row.question_count,
    dikirim: row.submitted_at,
  };
}

const STATUS_PRESENSI = ['hadir', 'izin', 'sakit', 'alpa'];

function dariBarisSesiPresensi(row) {
  if (!row || typeof row.id !== 'string' ||
      typeof row.classroom_id !== 'string' ||
      typeof row.tenant_id !== 'string' ||
      typeof row.attendance_date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(row.attendance_date) ||
      !Number.isFinite(Date.parse(`${row.attendance_date}T00:00:00Z`)) ||
      new Date(`${row.attendance_date}T00:00:00Z`).toISOString().slice(0, 10) !== row.attendance_date ||
      typeof row.title !== 'string' ||
      typeof row.created_by !== 'string' ||
      typeof row.created_at !== 'string' ||
      !Number.isFinite(Date.parse(row.created_at))) {
    throw new Error('Supabase mengembalikan sesi presensi yang tidak valid.');
  }
  return {
    id: row.id,
    classroomId: row.classroom_id,
    tenantId: row.tenant_id,
    tanggal: row.attendance_date,
    judul: row.title,
    dibuatOleh: row.created_by,
    dibuat: row.created_at,
  };
}

function dariBarisJadwal(row, userId = '') {
  if (!row || typeof row.id !== 'string' ||
      typeof row.classroom_id !== 'string' ||
      typeof row.tenant_id !== 'string' ||
      typeof row.teacher_id !== 'string' ||
      !Number.isInteger(row.weekday) || row.weekday < 1 || row.weekday > 7 ||
      typeof row.starts_at !== 'string' || !/^\d{2}:\d{2}(:\d{2})?$/.test(row.starts_at) ||
      typeof row.ends_at !== 'string' || !/^\d{2}:\d{2}(:\d{2})?$/.test(row.ends_at) ||
      row.starts_at.slice(0, 5) >= row.ends_at.slice(0, 5) ||
      typeof row.topic !== 'string' || typeof row.location !== 'string' ||
      typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at)) ||
      typeof row.updated_at !== 'string' || !Number.isFinite(Date.parse(row.updated_at))) {
    throw new Error('Supabase mengembalikan data jadwal kelas yang tidak valid.');
  }
  return {
    id: row.id,
    classroomId: row.classroom_id,
    tenantId: row.tenant_id,
    dapatDikelola: Boolean(userId && row.teacher_id === userId),
    hari: row.weekday,
    mulai: row.starts_at.slice(0, 5),
    selesai: row.ends_at.slice(0, 5),
    topik: row.topic,
    tempat: row.location,
    dibuat: row.created_at,
    diperbarui: row.updated_at,
  };
}

function dariBarisPresensi(row) {
  if (!row || typeof row.session_id !== 'string' ||
      typeof row.student_id !== 'string' ||
      !STATUS_PRESENSI.includes(row.status) ||
      (row.note !== null && typeof row.note !== 'string') ||
      typeof row.marked_at !== 'string' ||
      !Number.isFinite(Date.parse(row.marked_at))) {
    throw new Error('Supabase mengembalikan catatan presensi yang tidak valid.');
  }
  return {
    sessionId: row.session_id,
    studentId: row.student_id,
    namaSiswa: typeof row.student_name === 'string' ? row.student_name : '',
    status: row.status,
    catatan: row.note || '',
    dicatat: row.marked_at,
  };
}

function validasiTeks(value, maxLength) {
  return typeof value === 'string' &&
    value.trim().length > 0 &&
    value.trim().length <= maxLength &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
}

export async function muatTenantRuangKelas() {
  const { data, error } = await supabase
    .from('tenants')
    .select('id,name')
    .eq('active', true)
    .order('name');
  if (error) throw error;
  if (!Array.isArray(data) || data.some((tenant) =>
    typeof tenant.id !== 'string' || typeof tenant.name !== 'string')) {
    throw new Error('Supabase mengembalikan daftar sekolah yang tidak valid.');
  }
  return data.map(({ id, name }) => ({ id, nama: name }));
}

export async function muatDaftarRuangKelas(tenantId) {
  validasiTenantId(tenantId);
  const { data, error } = await supabase
    .from('learning_classrooms')
    .select('id,tenant_id,name,subject,grade,academic_year,created_by,created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Supabase tidak mengembalikan daftar ruang kelas.');
  return data.map(dariBarisRuangKelas);
}

export async function muatMateriRuangKelas(classroomId, tenantId) {
  validasiTenantId(tenantId);
  if (typeof classroomId !== 'string' || !classroomId.trim()) {
    throw new TypeError('Pilih ruang kelas yang valid untuk memuat materi.');
  }
  const { data, error } = await supabase
    .from('learning_classroom_materials')
    .select('id,classroom_id,tenant_id,title,content,created_by,created_at')
    .eq('classroom_id', classroomId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Supabase tidak mengembalikan daftar materi kelas.');
  return data.map(dariBarisMateri);
}

export async function buatMateriRuangKelas({ classroomId, tenantId, judul, isi }) {
  validasiTenantId(tenantId);
  if (typeof classroomId !== 'string' || !classroomId.trim() ||
      !validasiTeks(judul, 120) || !validasiTeks(isi, 20000)) {
    throw new TypeError('Judul, isi, atau ruang kelas materi tidak valid.');
  }
  const { data, error } = await supabase
    .from('learning_classroom_materials')
    .insert({
      classroom_id: classroomId,
      tenant_id: tenantId,
      title: judul.trim(),
      content: isi.trim(),
    })
    .select('id,classroom_id,tenant_id,title,content,created_by,created_at')
    .single();
  if (error) throw error;
  return dariBarisMateri(data);
}

export async function muatTugasRuangKelas(classroomId, tenantId) {
  validasiTenantId(tenantId);
  if (typeof classroomId !== 'string' || !classroomId.trim()) {
    throw new TypeError('Pilih ruang kelas yang valid untuk memuat tugas.');
  }
  const { data, error } = await supabase
    .from('learning_classroom_assignments')
    .select('id,classroom_id,tenant_id,title,instructions,due_at,created_by,created_at')
    .eq('classroom_id', classroomId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Supabase tidak mengembalikan daftar tugas kelas.');
  return data.map(dariBarisTugas);
}

export async function muatTugasUntukDasbor(tenantId, classroomIds) {
  validasiTenantId(tenantId);
  validasiDaftarId(classroomIds, 'ruang kelas');
  if (!classroomIds.length) return [];
  const { data, error } = await supabase
    .from('learning_classroom_assignments')
    .select('id,classroom_id,tenant_id,title,instructions,due_at,created_by,created_at')
    .eq('tenant_id', tenantId)
    .in('classroom_id', classroomIds)
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Supabase tidak mengembalikan daftar tugas kelas.');
  return data.map(dariBarisTugas);
}

export async function muatPengumpulanTugas(classroomId, role, assignmentIds = []) {
  if (typeof classroomId !== 'string' || !classroomId.trim()) {
    throw new TypeError('Pilih ruang kelas yang valid untuk memuat pengumpulan tugas.');
  }
  const isTeacher = PERAN_GURU_KELAS.includes(role);
  if (isTeacher) {
    const { data, error } = await supabase.rpc('learning_classroom_teacher_submissions', {
      p_classroom_id: classroomId,
    });
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('Supabase tidak mengembalikan pengumpulan tugas.');
    return data.map((row) => dariBarisPengumpulan({
      ...row,
      id: row.submission_id,
    }));
  }
  if (!Array.isArray(assignmentIds) || assignmentIds.some((id) => typeof id !== 'string')) {
    throw new TypeError('Daftar tugas untuk memuat pengumpulan tidak valid.');
  }
  if (role !== 'siswa' || assignmentIds.length === 0) return [];
  const { data, error } = await supabase
    .from('learning_classroom_submissions')
    .select('id,assignment_id,user_id,answer,submitted_at,score,feedback,graded_at')
    .in('assignment_id', assignmentIds);
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Supabase tidak mengembalikan pengumpulan tugas.');
  return data.map(dariBarisPengumpulan);
}

export async function buatTugasRuangKelas({ classroomId, tenantId, judul, instruksi, tenggat }) {
  validasiTenantId(tenantId);
  if (typeof classroomId !== 'string' || !classroomId.trim() ||
      !validasiTeks(judul, 120) || !validasiTeks(instruksi, 20000) ||
      (tenggat !== null && (
        typeof tenggat !== 'string' || !Number.isFinite(Date.parse(tenggat))
      ))) {
    throw new TypeError('Judul, instruksi, tenggat, atau ruang kelas tugas tidak valid.');
  }
  const { data, error } = await supabase
    .from('learning_classroom_assignments')
    .insert({
      classroom_id: classroomId,
      tenant_id: tenantId,
      title: judul.trim(),
      instructions: instruksi.trim(),
      due_at: tenggat,
    })
    .select('id,classroom_id,tenant_id,title,instructions,due_at,created_by,created_at')
    .single();
  if (error) throw error;
  return dariBarisTugas(data);
}

export async function kirimJawabanTugas(assignmentId, jawaban) {
  if (typeof assignmentId !== 'string' || !assignmentId.trim() ||
      !validasiTeks(jawaban, 20000)) {
    throw new TypeError('Jawaban atau tugas tidak valid.');
  }
  const { data, error } = await supabase.rpc('submit_learning_classroom_assignment', {
    p_assignment_id: assignmentId,
    p_answer: jawaban.trim(),
  });
  if (error) throw error;
  if (typeof data !== 'string' || !data) {
    throw new Error('Supabase tidak mengonfirmasi pengiriman jawaban.');
  }
  return data;
}

export async function nilaiPengumpulanTugas(submissionId, nilai, umpanBalik = '') {
  if (typeof submissionId !== 'string' || !submissionId.trim() ||
      !Number.isFinite(Number(nilai)) || Number(nilai) < 0 || Number(nilai) > 100 ||
      typeof umpanBalik !== 'string' || umpanBalik.trim().length > 2000) {
    throw new TypeError('Nilai atau umpan balik tidak valid.');
  }
  const { data, error } = await supabase.rpc('grade_learning_classroom_submission', {
    p_submission_id: submissionId,
    p_score: Number(nilai),
    p_feedback: umpanBalik.trim() || null,
  });
  if (error) throw error;
  if (typeof data !== 'string' || !data) {
    throw new Error('Supabase tidak mengonfirmasi penilaian tugas.');
  }
  return data;
}

export async function muatKuisRuangKelas(classroomId, tenantId) {
  validasiTenantId(tenantId);
  if (typeof classroomId !== 'string' || !classroomId.trim()) {
    throw new TypeError('Pilih ruang kelas yang valid untuk memuat kuis.');
  }
  const { data, error } = await supabase
    .from('learning_classroom_quizzes')
    .select('id,classroom_id,tenant_id,title,due_at,created_by,created_at')
    .eq('classroom_id', classroomId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Supabase tidak mengembalikan daftar kuis.');
  return data.map(dariBarisKuis);
}

export async function buatKuisRuangKelas({ classroomId, tenantId, judul, tenggat, soal }) {
  validasiTenantId(tenantId);
  if (typeof classroomId !== 'string' || !classroomId.trim() ||
      !validasiTeks(judul, 120) ||
      (tenggat !== null && (
        typeof tenggat !== 'string' || !Number.isFinite(Date.parse(tenggat))
      )) ||
      !Array.isArray(soal) || soal.length < 1 || soal.length > 50 ||
      soal.some((question) =>
        !question || !validasiTeks(question.pertanyaan, 2000) ||
        !Array.isArray(question.pilihan) ||
        question.pilihan.length < 2 || question.pilihan.length > 6 ||
        question.pilihan.some((choice) => !validasiTeks(choice, 500)) ||
        !Number.isInteger(question.jawabanBenar) ||
        question.jawabanBenar < 0 ||
        question.jawabanBenar >= question.pilihan.length)) {
    throw new TypeError('Data kuis tidak valid. Periksa judul, tenggat, soal, pilihan, dan kunci jawaban.');
  }
  const { data, error } = await supabase.rpc('create_learning_classroom_quiz', {
    p_classroom_id: classroomId,
    p_title: judul.trim(),
    p_due_at: tenggat,
    p_questions: soal.map((question) => ({
      prompt: question.pertanyaan.trim(),
      choices: question.pilihan.map((choice) => choice.trim()),
      correctChoice: question.jawabanBenar,
    })),
  });
  if (error) throw error;
  if (typeof data !== 'string' || !data) throw new Error('Supabase tidak mengonfirmasi pembuatan kuis.');
  return data;
}

export async function muatSoalKuisUntukSiswa(quizId) {
  if (typeof quizId !== 'string' || !quizId.trim()) {
    throw new TypeError('Pilih kuis yang valid untuk memuat soal.');
  }
  const { data, error } = await supabase.rpc('learning_classroom_quiz_questions_for_student', {
    p_quiz_id: quizId,
  });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Supabase tidak mengembalikan soal kuis.');
  const questions = data.map(dariBarisSoalKuis);
  if (questions.length === 0) throw new Error('Kuis ini belum memiliki soal yang tersedia.');
  return questions;
}

export async function kirimJawabanKuis(quizId, jawaban) {
  if (typeof quizId !== 'string' || !quizId.trim() ||
      !Array.isArray(jawaban) || jawaban.length < 1 || jawaban.length > 50 ||
      jawaban.some((answer) => !Number.isInteger(answer) || answer < 0 || answer > 5)) {
    throw new TypeError('Jawaban kuis tidak valid.');
  }
  const { data, error } = await supabase.rpc('submit_learning_classroom_quiz', {
    p_quiz_id: quizId,
    p_answers: jawaban,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  if (!row || typeof row.submission_id !== 'string' ||
      !Number.isFinite(Number(row.score)) ||
      !Number.isInteger(row.correct_count) ||
      !Number.isInteger(row.question_count)) {
    throw new Error('Supabase tidak mengembalikan hasil penilaian kuis yang valid.');
  }
  return {
    id: row.submission_id,
    nilai: Number(row.score),
    benar: row.correct_count,
    jumlahSoal: row.question_count,
  };
}

export async function muatHasilKuisSiswa(quizIds) {
  if (!Array.isArray(quizIds) || quizIds.some((id) => typeof id !== 'string')) {
    throw new TypeError('Daftar kuis tidak valid.');
  }
  if (quizIds.length === 0) return [];
  const { data, error } = await supabase
    .from('learning_classroom_quiz_submissions')
    .select('quiz_id,id,user_id,score,correct_count,question_count,submitted_at')
    .in('quiz_id', quizIds);
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Supabase tidak mengembalikan hasil kuis.');
  return data.map((row) => dariBarisHasilKuis({
    ...row,
    submission_id: row.id,
    student_name: '',
  }));
}

export async function muatHasilKuisGuru(classroomId) {
  if (typeof classroomId !== 'string' || !classroomId.trim()) {
    throw new TypeError('Pilih ruang kelas yang valid untuk memuat hasil kuis.');
  }
  const { data, error } = await supabase.rpc('learning_classroom_teacher_quiz_results', {
    p_classroom_id: classroomId,
  });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Supabase tidak mengembalikan hasil kuis kelas.');
  return data.map(dariBarisHasilKuis);
}

export async function muatSesiPresensiKelas(classroomId, tenantId) {
  validasiTenantId(tenantId);
  if (typeof classroomId !== 'string' || !classroomId.trim()) {
    throw new TypeError('Pilih ruang kelas yang valid untuk memuat presensi.');
  }
  const { data, error } = await supabase
    .from('learning_classroom_attendance_sessions')
    .select('id,classroom_id,tenant_id,attendance_date,title,created_by,created_at')
    .eq('classroom_id', classroomId)
    .eq('tenant_id', tenantId)
    .order('attendance_date', { ascending: false })
    .limit(100);
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Supabase tidak mengembalikan sesi presensi.');
  return data.map(dariBarisSesiPresensi);
}

export async function muatJadwalRuangKelas(classroomId, tenantId, userId = '') {
  validasiTenantId(tenantId);
  if (typeof classroomId !== 'string' || !classroomId.trim()) {
    throw new TypeError('Pilih ruang kelas yang valid untuk memuat jadwal.');
  }
  if (typeof userId !== 'string') throw new TypeError('Identitas pengguna jadwal tidak valid.');
  const { data, error } = await supabase
    .from('learning_classroom_schedules')
    .select('id,classroom_id,tenant_id,teacher_id,weekday,starts_at,ends_at,topic,location,created_at,updated_at')
    .eq('classroom_id', classroomId)
    .eq('tenant_id', tenantId)
    .order('weekday')
    .order('starts_at')
    .limit(200);
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Supabase tidak mengembalikan daftar jadwal kelas.');
  return data.map((row) => dariBarisJadwal(row, userId));
}

function dataJadwalBersih({ hari, mulai, selesai, topik, tempat = '' }) {
  if (!Number.isInteger(Number(hari)) || Number(hari) < 1 || Number(hari) > 7 ||
      typeof mulai !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(mulai) ||
      typeof selesai !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(selesai) ||
      mulai >= selesai || !validasiTeks(topik, 120) ||
      typeof tempat !== 'string' || tempat.trim().length > 120 ||
      /[\u0000-\u001f\u007f]/.test(tempat)) {
    throw new TypeError('Hari, waktu, topik, atau lokasi jadwal tidak valid.');
  }
  return {
    weekday: Number(hari),
    starts_at: mulai,
    ends_at: selesai,
    topic: topik.trim(),
    location: tempat.trim(),
  };
}

export async function buatJadwalRuangKelas({
  classroomId, tenantId, userId, hari, mulai, selesai, topik, tempat = '',
}) {
  validasiTenantId(tenantId);
  if (typeof classroomId !== 'string' || !classroomId.trim() ||
      typeof userId !== 'string' || !userId.trim()) {
    throw new TypeError('Ruang kelas atau identitas guru untuk jadwal tidak valid.');
  }
  const schedule = dataJadwalBersih({ hari, mulai, selesai, topik, tempat });
  const { data, error } = await supabase
    .from('learning_classroom_schedules')
    .insert({
      classroom_id: classroomId,
      tenant_id: tenantId,
      ...schedule,
    })
    .select('id,classroom_id,tenant_id,teacher_id,weekday,starts_at,ends_at,topic,location,created_at,updated_at')
    .single();
  if (error) throw error;
  return dariBarisJadwal(data, userId);
}

export async function ubahJadwalRuangKelas(scheduleId, updates, userId) {
  if (typeof scheduleId !== 'string' || !scheduleId.trim() ||
      typeof userId !== 'string' || !userId.trim()) {
    throw new TypeError('Jadwal atau identitas guru untuk pembaruan tidak valid.');
  }
  const schedule = dataJadwalBersih(updates);
  const { data, error } = await supabase
    .from('learning_classroom_schedules')
    .update(schedule)
    .eq('id', scheduleId)
    .select('id,classroom_id,tenant_id,teacher_id,weekday,starts_at,ends_at,topic,location,created_at,updated_at')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Jadwal tidak ditemukan atau tidak dapat diubah oleh akun ini.');
  return dariBarisJadwal(data, userId);
}

export async function hapusJadwalRuangKelas(scheduleId) {
  if (typeof scheduleId !== 'string' || !scheduleId.trim()) {
    throw new TypeError('Pilih jadwal yang valid untuk dihapus.');
  }
  const { data, error } = await supabase
    .from('learning_classroom_schedules')
    .delete()
    .eq('id', scheduleId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Jadwal tidak ditemukan atau tidak dapat dihapus oleh akun ini.');
}

export async function muatRosterPresensiKelas(classroomId) {
  if (typeof classroomId !== 'string' || !classroomId.trim()) {
    throw new TypeError('Pilih ruang kelas yang valid untuk memuat daftar siswa.');
  }
  const { data, error } = await supabase.rpc('learning_classroom_attendance_roster', {
    p_classroom_id: classroomId,
  });
  if (error) throw error;
  if (!Array.isArray(data) || data.some((student) =>
    typeof student.student_id !== 'string' || typeof student.student_name !== 'string')) {
    throw new Error('Supabase mengembalikan daftar siswa presensi yang tidak valid.');
  }
  return data.map((student) => ({
    id: student.student_id,
    nama: student.student_name,
  }));
}

export async function muatCatatanPresensiKelas(sessionIds) {
  if (!Array.isArray(sessionIds) || sessionIds.some((id) => typeof id !== 'string')) {
    throw new TypeError('Daftar sesi presensi tidak valid.');
  }
  if (sessionIds.length === 0) return [];
  const { data, error } = await supabase
    .from('learning_classroom_attendance')
    .select('session_id,student_id,status,note,marked_at')
    .in('session_id', sessionIds);
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Supabase tidak mengembalikan catatan presensi.');
  return data.map(dariBarisPresensi);
}

export async function buatSesiPresensiKelas({ classroomId, tanggal, judul }) {
  if (typeof classroomId !== 'string' || !classroomId.trim() ||
      typeof tanggal !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal) ||
      !validasiTeks(judul, 120)) {
    throw new TypeError('Tanggal, judul, atau ruang kelas sesi presensi tidak valid.');
  }
  const parsed = new Date(`${tanggal}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== tanggal) {
    throw new TypeError('Tanggal sesi presensi tidak valid.');
  }
  const { data, error } = await supabase.rpc('create_learning_classroom_attendance_session', {
    p_classroom_id: classroomId,
    p_attendance_date: tanggal,
    p_title: judul.trim(),
  });
  if (error) throw error;
  if (typeof data !== 'string' || !data) {
    throw new Error('Supabase tidak mengonfirmasi pembuatan sesi presensi.');
  }
  return data;
}

export async function simpanPresensiKelas(sessionId, records) {
  if (typeof sessionId !== 'string' || !sessionId.trim() ||
      !Array.isArray(records) || records.length < 1 || records.length > 1000 ||
      records.some((record) =>
        !record || typeof record.studentId !== 'string' || !record.studentId.trim() ||
        !STATUS_PRESENSI.includes(record.status) ||
        typeof (record.note || '') !== 'string' ||
        (record.note || '').trim().length > 500) ||
      new Set(records.map((record) => record.studentId)).size !== records.length) {
    throw new TypeError('Daftar presensi siswa tidak valid atau belum lengkap.');
  }
  const { data, error } = await supabase.rpc('record_learning_classroom_attendance', {
    p_session_id: sessionId,
    p_records: records.map((record) => ({
      studentId: record.studentId,
      status: record.status,
      note: (record.note || '').trim() || null,
    })),
  });
  if (error) throw error;
  if (data !== records.length) {
    throw new Error('Jumlah presensi yang disimpan tidak sesuai jumlah siswa.');
  }
  return data;
}

export async function muatKandidatAnggotaRuangKelas(tenantId) {
  validasiTenantId(tenantId);
  const { data, error } = await supabase.rpc('learning_classroom_candidates', {
    p_tenant_id: tenantId,
  });
  if (error) throw error;
  if (!Array.isArray(data) || data.some((profile) =>
    typeof profile.id !== 'string' ||
    typeof profile.nama !== 'string' ||
    ![...PERAN_GURU_KELAS, 'siswa'].includes(profile.role))) {
    throw new Error('Supabase mengembalikan daftar guru/siswa yang tidak valid.');
  }
  return data.map(({ id, nama, role }) => ({ id, nama, role }));
}

export async function buatRuangKelas({
  tenantId,
  nama,
  mapel,
  tingkat,
  tahunAjaran,
  guruIds,
  siswaIds,
}) {
  validasiTenantId(tenantId);
  const teks = (value) => typeof value === 'string' && !/[\u0000-\u001f\u007f]/.test(value);
  if (!teks(nama) || nama.trim().length < 2 || nama.trim().length > 120 ||
      !teks(mapel) || mapel.trim().length < 1 || mapel.trim().length > 120 ||
      !teks(tingkat) || tingkat.trim().length < 1 || tingkat.trim().length > 30 ||
      !teks(tahunAjaran) || tahunAjaran.trim().length < 4 || tahunAjaran.trim().length > 20) {
    throw new TypeError('Nama, mata pelajaran, tingkat, atau tahun ajaran tidak valid.');
  }
  validasiDaftarId(guruIds, 'guru', true);
  validasiDaftarId(siswaIds, 'siswa', true);
  if (guruIds.some((id) => siswaIds.includes(id))) {
    throw new TypeError('Satu akun tidak dapat ditetapkan sebagai guru dan siswa sekaligus.');
  }

  const { data, error } = await supabase.rpc('create_learning_classroom', {
    p_tenant_id: tenantId,
    p_name: nama.trim(),
    p_subject: mapel.trim(),
    p_grade: tingkat.trim(),
    p_academic_year: tahunAjaran.trim(),
    p_teacher_ids: guruIds,
    p_student_ids: siswaIds,
  });
  if (error) throw error;
  if (typeof data !== 'string' || !data) {
    throw new Error('Supabase tidak mengonfirmasi pembuatan ruang kelas.');
  }
  return data;
}
