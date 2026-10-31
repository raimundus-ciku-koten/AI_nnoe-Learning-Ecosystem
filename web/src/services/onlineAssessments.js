import { supabase } from '../lib/supabase.ts';

const DRAFT_PREFIX = 'ale-online-exam-draft-v1';

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

export async function muatSoalUjianSekolah(tenantId) {
  wajibText(tenantId, 'Tenant');
  const { data, error } = await supabase
    .from('question_bank')
    .select('id,mapel,kelas,jenis,pertanyaan,pilihan')
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  if (!Array.isArray(data) || data.some((row) =>
    !row || typeof row.id !== 'string' || typeof row.mapel !== 'string' ||
    typeof row.kelas !== 'string' || !['pilihan_ganda', 'uraian'].includes(row.jenis) ||
    typeof row.pertanyaan !== 'string' || !Array.isArray(row.pilihan) ||
    row.pilihan.some((choice) => typeof choice !== 'string'))) {
    throw new Error('Daftar soal sekolah tidak valid.');
  }
  return data;
}

export async function muatRosterUjianSekolah(kelas) {
  if (!Array.isArray(kelas) || kelas.length < 1 || kelas.length > 100 ||
    kelas.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new TypeError('Pilih kelas yang valid untuk memuat roster.');
  }
  const { data, error } = await supabase.rpc('school_exam_student_roster', { p_kelas: kelas });
  if (error) throw error;
  if (!Array.isArray(data) || data.some((row) =>
    !row || typeof row.student_id !== 'string' || typeof row.nama !== 'string' ||
    typeof row.kelas !== 'string' || typeof row.account_linked !== 'boolean')) {
    throw new Error('Roster peserta ujian tidak valid.');
  }
  return data.map((row) => ({
    id: row.student_id,
    nama: row.nama,
    kelas: row.kelas,
    akunTertaut: row.account_linked,
  }));
}

export async function muatKelasUjianSekolah() {
  const { data, error } = await supabase.rpc('school_exam_available_classes');
  if (error) throw error;
  if (!Array.isArray(data) || data.some((row) =>
    !row || typeof row.kelas !== 'string' ||
    !Number.isInteger(row.student_count) || row.student_count < 0 ||
    !Number.isInteger(row.linked_count) || row.linked_count < 0 || row.linked_count > row.student_count)) {
    throw new Error('Daftar kelas ujian tidak valid.');
  }
  return data;
}

export async function muatRingkasanUjianGuru() {
  const { data, error } = await supabase.rpc('teacher_online_exam_overview');
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Ringkasan ujian guru tidak valid.');
  return data;
}

export async function muatRingkasanUjianSekolah() {
  const { data, error } = await supabase.rpc('school_admin_online_exam_overview');
  if (error) throw error;
  const allowedFields = new Set([
    'exam_id', 'title', 'kelas', 'starts_at', 'ends_at', 'duration_minutes',
    'status', 'teacher_name', 'participant_count', 'attempt_count',
    'submitted_count', 'pending_review_count',
  ]);
  if (!Array.isArray(data) || data.some((row) =>
    !row || typeof row !== 'object' || Object.keys(row).some((field) => !allowedFields.has(field)) ||
    typeof row.exam_id !== 'string' || typeof row.title !== 'string' ||
    typeof row.kelas !== 'string' || typeof row.teacher_name !== 'string' ||
    !['active', 'closed'].includes(row.status) ||
    !Number.isInteger(row.duration_minutes) || row.duration_minutes < 1 || row.duration_minutes > 300 ||
    !Number.isFinite(Date.parse(row.starts_at)) || !Number.isFinite(Date.parse(row.ends_at)) ||
    Date.parse(row.ends_at) <= Date.parse(row.starts_at) ||
    !['participant_count', 'attempt_count', 'submitted_count', 'pending_review_count']
      .every((field) => Number.isInteger(row[field]) && row[field] >= 0))) {
    throw new Error('Ringkasan ujian sekolah tidak valid.');
  }
  return data;
}

export async function muatLegerUjianWali() {
  const { data, error } = await supabase.rpc('homeroom_exam_grade_ledger');
  if (error) throw error;
  const allowedFields = new Set([
    'student_id', 'student_name', 'kelas', 'exam_id', 'exam_title', 'starts_at',
    'duration_minutes', 'attempt_status', 'objective_correct', 'objective_total',
    'score', 'grade_pending', 'submitted_at',
  ]);
  if (!Array.isArray(data) || data.some((row) =>
    !row || typeof row !== 'object' || Object.keys(row).some((field) => !allowedFields.has(field)) ||
    typeof row.student_id !== 'string' || typeof row.student_name !== 'string' || typeof row.kelas !== 'string' ||
    (row.exam_id !== null && typeof row.exam_id !== 'string') ||
    (row.exam_title !== null && typeof row.exam_title !== 'string') ||
    (row.starts_at !== null && !Number.isFinite(Date.parse(row.starts_at))) ||
    (row.duration_minutes !== null && (!Number.isInteger(row.duration_minutes) || row.duration_minutes < 1 || row.duration_minutes > 300)) ||
    !['not_scheduled', 'not_started', 'in_progress', 'submitted'].includes(row.attempt_status) ||
    !Number.isInteger(row.objective_correct) || row.objective_correct < 0 ||
    !Number.isInteger(row.objective_total) || row.objective_total < 0 ||
    (row.score !== null && !Number.isFinite(Number(row.score))) ||
    typeof row.grade_pending !== 'boolean' ||
    (row.submitted_at !== null && !Number.isFinite(Date.parse(row.submitted_at))))) {
    throw new Error('Data leger kelas tidak valid.');
  }
  return data.map((row) => ({
    studentId: row.student_id,
    studentName: row.student_name,
    kelas: row.kelas,
    examId: row.exam_id,
    examTitle: row.exam_title,
    startsAt: row.starts_at,
    durationMinutes: row.duration_minutes,
    status: row.attempt_status,
    objectiveCorrect: row.objective_correct,
    objectiveTotal: row.objective_total,
    score: row.score === null || row.grade_pending ? null : Number(row.score),
    gradePending: row.grade_pending,
    submittedAt: row.submitted_at,
  }));
}

export function buatCsvRingkasanUjianSekolah(exams) {
  const headers = [
    'Paket ujian',
    'Kelas',
    'Pembuat',
    'Mulai',
    'Berakhir',
    'Durasi (menit)',
    'Peserta terdaftar',
    'Percobaan',
    'Submission',
    'Menunggu tinjauan uraian',
    'Status',
  ];
  if (!Array.isArray(exams) || exams.some((exam) =>
    !exam || typeof exam.title !== 'string' || typeof exam.kelas !== 'string'
    || typeof exam.teacher_name !== 'string'
    || !Number.isFinite(Date.parse(exam.starts_at)) || !Number.isFinite(Date.parse(exam.ends_at))
    || !['active', 'closed'].includes(exam.status)
    || !Number.isSafeInteger(exam.duration_minutes) || exam.duration_minutes < 1 || exam.duration_minutes > 300
    || !['participant_count', 'attempt_count', 'submitted_count', 'pending_review_count']
      .every((field) => Number.isSafeInteger(exam[field]) && exam[field] >= 0))) {
    throw new TypeError('Ringkasan ujian tidak valid untuk ekspor.');
  }
  const safeCell = (value) => {
    const text = String(value ?? '');
    const protectedText = /^[\u0000-\u0020]*[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${protectedText.replaceAll('"', '""')}"`;
  };
  const rows = exams.map((exam) => [
    exam.title,
    exam.kelas,
    exam.teacher_name,
    exam.starts_at,
    exam.ends_at,
    exam.duration_minutes,
    exam.participant_count,
    exam.attempt_count,
    exam.submitted_count,
    exam.pending_review_count,
    exam.status === 'active' ? 'Aktif' : 'Ditutup',
  ]);
  return `\uFEFF${[headers, ...rows].map((row) => row.map(safeCell).join(',')).join('\r\n')}`;
}

export async function muatHasilUjianGuru() {
  const { data, error } = await supabase.rpc('teacher_online_exam_results');
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Daftar hasil ujian tidak valid.');
  return data;
}

export function buatTautanUjianSiswa(examId, origin, pathname) {
  if (typeof examId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(examId)) {
    throw new TypeError('ID ujian tidak valid untuk tautan siswa.');
  }
  if (typeof origin !== 'string' || typeof pathname !== 'string') {
    throw new TypeError('Alamat aplikasi tidak valid untuk tautan siswa.');
  }
  const url = new URL(`${origin}${pathname}`);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new TypeError('Alamat aplikasi tidak aman untuk tautan siswa.');
  }
  url.hash = `/siswa/ujian?examId=${encodeURIComponent(examId)}`;
  return url.href;
}

export function buatDataEksporHasilUjian(results, examId = 'all') {
  if (!Array.isArray(results) || (examId !== 'all' && typeof examId !== 'string')) {
    throw new TypeError('Pilihan hasil ujian untuk ekspor tidak valid.');
  }
  const selected = examId === 'all'
    ? results
    : results.filter((result) => result?.exam_id === examId);
  if (selected.length > 499) {
    throw new RangeError('Ekspor Google Sheets dibatasi 499 hasil per berkas. Pilih satu ujian agar ekspor tetap lengkap.');
  }
  const rows = selected.map((result, index) => {
    if (!result || typeof result.exam_id !== 'string' ||
      typeof result.student_name !== 'string' ||
      typeof result.title !== 'string' ||
      typeof result.kelas !== 'string' ||
      typeof result.submitted_at !== 'string' ||
      !Number.isFinite(Date.parse(result.submitted_at)) ||
      !Number.isInteger(result.objective_correct) ||
      !Number.isInteger(result.objective_total) ||
      typeof result.grade_pending !== 'boolean' ||
      (!result.grade_pending && result.score !== null && !Number.isFinite(Number(result.score)))) {
      throw new TypeError(`Data hasil ujian nomor ${index + 1} tidak valid untuk ekspor.`);
    }
    return [
      result.student_name,
      result.title,
      result.kelas,
      result.submitted_at,
      String(result.objective_correct),
      String(result.objective_total),
      result.grade_pending || result.score === null ? '' : String(result.score),
      result.grade_pending ? 'Menunggu penilaian uraian' : 'Selesai dinilai',
    ];
  });
  return [
    ['Nama siswa', 'Ujian', 'Kelas', 'Dikumpulkan (UTC)', 'PG benar', 'PG total', 'Nilai akhir', 'Status'],
    ...rows,
  ];
}

export async function muatNilaiUjianSiswa() {
  const { data, error } = await supabase.rpc('student_online_exam_results');
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Daftar nilai ujian siswa tidak valid.');
  return data;
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
  title, kelas, startsAt, endsAt, durationMinutes, questionIds = [], customQuestions = [],
}) {
  wajibText(title, 'Judul ujian');
  wajibText(kelas, 'Kelas');
  wajibText(startsAt, 'Waktu mulai');
  wajibText(endsAt, 'Waktu selesai');
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 300 ||
    !Array.isArray(questionIds) || questionIds.length > 100 ||
    !Array.isArray(customQuestions) || customQuestions.length > 100 ||
    questionIds.length + customQuestions.length < 1 || questionIds.length + customQuestions.length > 100 ||
    new Set(questionIds).size !== questionIds.length) {
    throw new TypeError('Durasi atau daftar soal tidak valid.');
  }
  if (Date.parse(endsAt) <= Date.parse(startsAt)) {
    throw new TypeError('Waktu selesai harus setelah waktu mulai.');
  }

  const { data, error } = await supabase.rpc('create_teacher_online_exam_from_questions', {
    p_title: title.trim(),
    p_kelas: kelas.trim(),
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_duration_minutes: durationMinutes,
    p_question_ids: questionIds,
    p_custom_questions: customQuestions.map((question) => ({
      mapel: question.mapel,
      kelas: question.kelas,
      jenis: question.jenis,
      pertanyaan: question.pertanyaan,
      pilihan: question.pilihan,
      jawaban: question.jawaban,
      pembahasan: question.pembahasan,
    })),
  });
  if (error) throw error;
  wajibText(data, 'ID ujian');
  return data;
}

export async function buatUjianSekolahOnline({
  title, kelas, startsAt, endsAt, durationMinutes, questionIds = [],
  customQuestions = [], studentIds = [], reviewerTeacherId = '',
}) {
  wajibText(title, 'Judul ujian');
  if (!Array.isArray(kelas) || kelas.length < 1 || kelas.length > 100 ||
    kelas.some((item) => typeof item !== 'string' || !item.trim()) ||
    new Set(kelas).size !== kelas.length ||
    !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 300 ||
    !Array.isArray(questionIds) || questionIds.length > 500 ||
    !Array.isArray(customQuestions) || customQuestions.length > 500 ||
    questionIds.length + customQuestions.length < 1 || questionIds.length + customQuestions.length > 500 ||
    !Array.isArray(studentIds) || studentIds.length > 2000 ||
    new Set(questionIds).size !== questionIds.length ||
    new Set(studentIds).size !== studentIds.length ||
    (reviewerTeacherId && typeof reviewerTeacherId !== 'string')) {
    throw new TypeError('Kelas, durasi, atau daftar soal ujian sekolah tidak valid.');
  }
  wajibText(startsAt, 'Waktu mulai');
  wajibText(endsAt, 'Waktu selesai');
  if (Date.parse(endsAt) <= Date.parse(startsAt)) {
    throw new TypeError('Waktu selesai harus setelah waktu mulai.');
  }
  const { data, error } = await supabase.rpc('create_school_online_exams_v2', {
    p_title: title.trim(),
    p_kelas: kelas.map((item) => item.trim()),
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_duration_minutes: durationMinutes,
    p_question_ids: questionIds,
    p_custom_questions: customQuestions.map((question) => ({
      mapel: question.mapel,
      kelas: question.kelas,
      jenis: question.jenis,
      pertanyaan: question.pertanyaan,
      pilihan: question.pilihan,
      jawaban: question.jawaban,
    })),
    p_student_ids: studentIds,
    p_reviewer_teacher_id: reviewerTeacherId || null,
  });
  if (error) throw error;
  if (!Array.isArray(data) || data.length !== kelas.length || data.some((id) => typeof id !== 'string')) {
    throw new Error('Server tidak mengembalikan paket ujian sekolah yang valid.');
  }
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
