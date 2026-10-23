import { supabase } from '../lib/supabase.ts';

const DRAFT_PREFIX = 'ale-online-exam-draft-v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STUDENT_EXAM_FIELDS = new Set([
  'exam_id',
  'title',
  'kelas',
  'starts_at',
  'ends_at',
  'duration_minutes',
  'attempt_status',
]);

function wajibText(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${label} tidak valid.`);
  }
}

function validasiPaketUjian(exam) {
  if (!exam || typeof exam !== 'object' ||
      typeof exam.examId !== 'string' ||
      typeof exam.attemptId !== 'string' ||
      typeof exam.title !== 'string' ||
      !Number.isFinite(Date.parse(exam.deadline)) ||
      !Array.isArray(exam.questions) || exam.questions.length === 0) {
    throw new Error('Paket ujian dari server tidak valid.');
  }

  for (const [index, question] of exam.questions.entries()) {
    if (!question || typeof question.id !== 'string' ||
        !['pilihan_ganda', 'uraian'].includes(question.kind) ||
        typeof question.prompt !== 'string' ||
        !Array.isArray(question.choices) ||
        typeof question.position !== 'number' ||
        question.choices.some((choice) => typeof choice !== 'string' || choice.length > 300) ||
        (question.kind === 'pilihan_ganda' &&
          (question.choices.length < 2 || question.choices.length > 5)) ||
        (question.kind === 'uraian' && question.choices.length !== 0) ||
        Object.hasOwn(question, 'correct_answer') ||
        Object.hasOwn(question, 'jawaban')) {
      throw new Error(`Soal ujian nomor ${index + 1} tidak valid.`);
    }
  }
  return exam;
}

export async function muatUjianSiswa() {
  const { data, error } = await supabase.rpc('student_online_exams');
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Daftar ujian siswa tidak valid.');
  const invalidExam = data.some((exam) => {
    if (!exam || typeof exam !== 'object' ||
        Object.keys(exam).some((field) => !STUDENT_EXAM_FIELDS.has(field)) ||
        !UUID_PATTERN.test(exam.exam_id || '') ||
        typeof exam.title !== 'string' ||
        !exam.title.trim() || Array.from(exam.title).length > 160 ||
        typeof exam.kelas !== 'string' ||
        !exam.kelas.trim() || Array.from(exam.kelas).length > 30 ||
        typeof exam.starts_at !== 'string' ||
        typeof exam.ends_at !== 'string' ||
        !Number.isInteger(exam.duration_minutes) ||
        exam.duration_minutes < 1 || exam.duration_minutes > 300 ||
        !['submitted', 'in_progress', 'not_started'].includes(exam.attempt_status)) {
      return true;
    }
    const startsAt = Date.parse(exam.starts_at);
    const endsAt = Date.parse(exam.ends_at);
    return !Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt;
  });
  if (invalidExam) {
    throw new Error('Data ujian siswa dari server tidak valid.');
  }
  return data;
}

export async function muatRosterBelumTertaut() {
  const { data, error } = await supabase.rpc('unlinked_student_roster');
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Daftar roster yang belum ditautkan tidak valid.');
  return data;
}

export async function muatAkunSiswaBelumTertaut() {
  const { data, error } = await supabase.rpc('unlinked_student_accounts');
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Daftar akun siswa yang belum ditautkan tidak valid.');
  return data;
}

export async function muatAkunSiswaTertaut() {
  const { data, error } = await supabase.rpc('linked_student_accounts');
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Daftar tautan akun siswa tidak valid.');
  return data;
}

export async function tautkanAkunSiswa(studentId, userId) {
  wajibText(studentId, 'ID siswa');
  wajibText(userId, 'ID akun siswa');
  const { error } = await supabase.rpc('link_student_account', {
    p_student_id: studentId,
    p_student_user_id: userId,
  });
  if (error) throw error;
}

export async function lepasTautanAkunSiswa(studentId) {
  wajibText(studentId, 'ID siswa');
  const { error } = await supabase.rpc('unlink_student_account', {
    p_student_id: studentId,
  });
  if (error) throw error;
}

export async function muatSoalUjianGuru(tenantId, ownerId) {
  wajibText(tenantId, 'Tenant');
  wajibText(ownerId, 'Akun guru');
  const { data, error } = await supabase
    .from('question_bank')
    .select('id,mapel,kelas,jenis,pertanyaan,pilihan')
    .eq('tenant_id', tenantId)
    .eq('owner_id', ownerId)
    .order('updated_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Daftar soal guru tidak valid.');
  return data;
}

export async function muatRingkasanUjianGuru() {
  const { data, error } = await supabase.rpc('teacher_online_exam_overview');
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Ringkasan ujian guru tidak valid.');
  return data;
}

export async function muatHasilUjianGuru() {
  const { data, error } = await supabase.rpc('teacher_online_exam_results');
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Daftar hasil ujian tidak valid.');
  const validNumber = (value) => value === null || value === undefined ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)));
  if (data.some((row) => (
    !row || typeof row.attempt_id !== 'string' || typeof row.exam_id !== 'string' ||
    typeof row.title !== 'string' || typeof row.kelas !== 'string' ||
    typeof row.student_name !== 'string' || typeof row.submitted_at !== 'string' ||
    !Number.isFinite(Date.parse(row.submitted_at)) ||
    !Number.isInteger(row.objective_correct) || !Number.isInteger(row.objective_total) ||
    !validNumber(row.score) || !validNumber(row.essay_score) ||
    typeof row.grade_pending !== 'boolean'
  ))) {
    throw new Error('Data hasil ujian guru dari server tidak valid.');
  }
  return data;
}

export async function muatNilaiUjianSiswa() {
  const { data, error } = await supabase.rpc('student_online_exam_results');
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Daftar nilai ujian siswa tidak valid.');
  const validNumber = (value) => value === null || value === undefined ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)));
  if (data.some((row) => (
    !row || typeof row.exam_id !== 'string' || typeof row.title !== 'string' ||
    typeof row.kelas !== 'string' || typeof row.submitted_at !== 'string' ||
    !Number.isFinite(Date.parse(row.submitted_at)) || !validNumber(row.score) ||
    typeof row.grade_pending !== 'boolean'
  ))) {
    throw new Error('Data nilai ujian siswa dari server tidak valid.');
  }
  return data;
}

export function ringkasNilaiUjianSiswa(results) {
  if (!Array.isArray(results)) throw new TypeError('Data ringkasan nilai siswa tidak valid.');
  if (results.some((result) =>
    !result || typeof result.exam_id !== 'string' ||
    typeof result.title !== 'string' || typeof result.kelas !== 'string' ||
    typeof result.submitted_at !== 'string' || !Number.isFinite(Date.parse(result.submitted_at)) ||
    typeof result.grade_pending !== 'boolean' ||
    (result.score !== null && result.score !== undefined &&
      !(typeof result.score === 'number' && Number.isFinite(result.score)) &&
      !(typeof result.score === 'string' && result.score.trim() !== '' &&
        Number.isFinite(Number(result.score))))
  )) {
    throw new Error('Data ringkasan nilai siswa dari server tidak valid.');
  }

  const graded = results.filter((result) => !result.grade_pending && result.score !== null &&
    result.score !== undefined);
  const latest = [...results].sort((a, b) =>
    Date.parse(b.submitted_at) - Date.parse(a.submitted_at))[0] || null;
  return {
    resultCount: results.length,
    gradedCount: graded.length,
    pendingCount: results.filter((result) => result.grade_pending).length,
    averageScore: graded.length
      ? graded.reduce((sum, result) => sum + Number(result.score), 0) / graded.length
      : null,
    latest,
  };
}

export async function muatJawabanUraianGuru() {
  const { data, error } = await supabase.rpc('teacher_online_exam_essay_reviews');
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Daftar jawaban uraian tidak valid.');
  return data;
}

export async function nilaiJawabanUraian(attemptId, essayScore) {
  wajibText(attemptId, 'ID sesi ujian');
  if (!Number.isFinite(essayScore) || essayScore < 0 || essayScore > 100) {
    throw new TypeError('Nilai uraian harus berada antara 0 dan 100.');
  }
  const { data, error } = await supabase.rpc('review_online_exam_essays', {
    p_attempt_id: attemptId,
    p_essay_score: essayScore,
  });
  if (error) throw error;
  if (data === null || data === undefined || !Number.isFinite(Number(data))) {
    throw new Error('Server tidak mengembalikan nilai akhir yang valid.');
  }
  return Number(data);
}

export async function buatUjianOnline({
  title, kelas, startsAt, endsAt, durationMinutes, questionIds,
}) {
  wajibText(title, 'Judul ujian');
  wajibText(kelas, 'Kelas');
  wajibText(startsAt, 'Waktu mulai');
  wajibText(endsAt, 'Waktu selesai');
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 300 ||
      !Array.isArray(questionIds) || questionIds.length < 1 || questionIds.length > 100 ||
      new Set(questionIds).size !== questionIds.length) {
    throw new TypeError('Durasi atau daftar soal tidak valid.');
  }
  if (Date.parse(endsAt) <= Date.parse(startsAt)) {
    throw new TypeError('Waktu selesai harus setelah waktu mulai.');
  }

  const { data, error } = await supabase.rpc('create_online_exam', {
    p_title: title.trim(),
    p_kelas: kelas.trim(),
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_duration_minutes: durationMinutes,
    p_question_ids: questionIds,
  });
  if (error) throw error;
  wajibText(data, 'ID ujian');
  return data;
}

export async function mulaiUjianOnline(examId) {
  wajibText(examId, 'ID ujian');
  const { data, error } = await supabase.rpc('start_student_online_exam', {
    p_exam_id: examId,
  });
  if (error) throw error;
  return validasiPaketUjian(data);
}

export async function kirimJawabanUjian(attemptId, submissionId, answers) {
  wajibText(attemptId, 'ID sesi ujian');
  wajibText(submissionId, 'ID pengumpulan');
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    throw new TypeError('Jawaban ujian tidak valid.');
  }
  const { data, error } = await supabase.rpc('submit_student_online_exam', {
    p_attempt_id: attemptId,
    p_submission_id: submissionId,
    p_answers: answers,
  });
  if (error) throw error;
  if (!data || data.submitted !== true) {
    throw new Error('Server belum mengonfirmasi pengumpulan ujian.');
  }
  return data;
}

function draftKey(userId, examId) {
  wajibText(userId, 'Akun siswa');
  wajibText(examId, 'ID ujian');
  return `${DRAFT_PREFIX}:${userId}:${examId}`;
}

export function simpanDraftUjian(userId, exam, answers, submissionId = '') {
  validasiPaketUjian(exam);
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    throw new TypeError('Draft jawaban tidak valid.');
  }
  const key = draftKey(userId, exam.examId);
  const storage = globalThis.sessionStorage;
  if (!storage) throw new Error('Penyimpanan sesi browser tidak tersedia.');
  storage.setItem(key, JSON.stringify({
    exam,
    answers,
    submissionId,
    expiresAt: Date.parse(exam.deadline) + 24 * 60 * 60 * 1000,
  }));
}

export function muatDraftUjian(userId, examId) {
  const storage = globalThis.sessionStorage;
  if (!storage) return null;
  const raw = storage.getItem(draftKey(userId, examId));
  if (!raw) return null;
  let draft;
  try {
    draft = JSON.parse(raw);
  } catch (cause) {
    storage.removeItem(draftKey(userId, examId));
    throw new Error('Draft ujian tersimpan rusak dan telah dihapus.', { cause });
  }
  if (!Number.isFinite(draft.expiresAt) || Date.now() > draft.expiresAt) {
    storage.removeItem(draftKey(userId, examId));
    return null;
  }
  validasiPaketUjian(draft.exam);
  if (!draft.answers || typeof draft.answers !== 'object' || Array.isArray(draft.answers) ||
      typeof draft.submissionId !== 'string') {
    throw new Error('Format draft ujian tersimpan tidak valid.');
  }
  return draft;
}

export function hapusDraftUjian(userId, examId) {
  const storage = globalThis.sessionStorage;
  if (!storage) return;
  storage.removeItem(draftKey(userId, examId));
}

export function daftarDraftUjian(userId) {
  wajibText(userId, 'Akun siswa');
  const storage = globalThis.sessionStorage;
  if (!storage) return [];
  const prefix = `${DRAFT_PREFIX}:${userId}:`;
  const drafts = [];
  const keys = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  for (const key of keys) {
    const examId = key.slice(prefix.length);
    const draft = muatDraftUjian(userId, examId);
    if (draft) drafts.push(draft);
  }
  return drafts;
}
