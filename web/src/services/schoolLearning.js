import { supabase } from '../lib/supabase.ts';

const FIELDS = 'id,tenant_id,author_id,class_name,kind,title,body,starts_at,due_at,published,created_at,updated_at';
const MAX_TITLE = 200;
const MAX_BODY = 10000;

function text(value, label, maxLength, allowLineBreaks = false) {
  if (typeof value !== 'string') throw new TypeError(`${label} harus berupa teks.`);
  const result = value.trim();
  const controls = allowLineBreaks
    ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/
    : /[\u0000-\u001f\u007f]/;
  if (!result || result.length > maxLength || controls.test(result)) {
    throw new TypeError(`${label} wajib diisi dan maksimal ${maxLength} karakter.`);
  }
  return result;
}

function scope(tenantId) {
  if (typeof tenantId !== 'string' || !tenantId.trim()) {
    throw new Error('Akun belum terhubung ke sekolah.');
  }
  return tenantId.trim();
}

function dateValue(value, label, required = false) {
  if (!value && !required) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`${label} tidak valid.`);
  return date.toISOString();
}

function mapItem(row) {
  if (!row || typeof row.id !== 'string' ||
      !['schedule', 'task', 'material'].includes(row.kind) ||
      typeof row.class_name !== 'string' || typeof row.title !== 'string' ||
      typeof row.body !== 'string' || typeof row.published !== 'boolean') {
    throw new Error('Data jadwal atau materi dari server tidak valid.');
  }
  return {
    id: row.id,
    tenantId: row.tenant_id,
    authorId: row.author_id,
    className: row.class_name,
    kind: row.kind,
    title: row.title,
    body: row.body,
    startsAt: row.starts_at,
    dueAt: row.due_at,
    published: row.published,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function payload(tenantId, authorId, draft) {
  if (typeof authorId !== 'string' || !authorId.trim()) {
    throw new Error('Akun belum masuk.');
  }
  if (!['schedule', 'task', 'material'].includes(draft?.kind)) {
    throw new TypeError('Jenis kegiatan belajar tidak valid.');
  }
  const startsAt = dateValue(draft.startsAt, 'Waktu jadwal', draft.kind === 'schedule');
  const dueAt = dateValue(draft.dueAt, 'Tenggat', draft.kind === 'task');
  if (draft.kind === 'material' && (startsAt || dueAt)) {
    throw new TypeError('Materi tidak menggunakan waktu jadwal atau tenggat.');
  }
  if (startsAt && dueAt && new Date(dueAt) < new Date(startsAt)) {
    throw new TypeError('Tenggat tidak boleh sebelum waktu jadwal.');
  }
  return {
    tenant_id: tenantId,
    author_id: authorId.trim(),
    class_name: text(draft.className, 'Kelas', 30),
    kind: draft.kind,
    title: text(draft.title, 'Judul', MAX_TITLE),
    body: text(draft.body, 'Isi', MAX_BODY, true),
    starts_at: startsAt,
    due_at: dueAt,
    published: draft.published === true,
  };
}

export async function muatJadwalMateriStaf(tenantId) {
  const { data, error } = await supabase
    .from('school_learning_items')
    .select(FIELDS)
    .eq('tenant_id', scope(tenantId))
    .order('starts_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Daftar jadwal dan materi tidak valid.');
  return data.map(mapItem);
}

export async function muatKelasRosterGuru(tenantId, ownerId) {
  const school = scope(tenantId);
  if (typeof ownerId !== 'string' || !ownerId.trim()) {
    throw new Error('Akun guru belum tersedia.');
  }
  const { data, error } = await supabase
    .from('students')
    .select('kelas')
    .eq('tenant_id', school)
    .eq('owner_id', ownerId.trim())
    .order('kelas', { ascending: true })
    .limit(2000);
  if (error) throw error;
  if (!Array.isArray(data) || data.some((row) => typeof row.kelas !== 'string')) {
    throw new Error('Daftar kelas roster dari server tidak valid.');
  }
  return [...new Set(data.map((row) => row.kelas.trim()).filter(Boolean))];
}

export async function muatJadwalMateriSiswa() {
  const { data, error } = await supabase.rpc('student_learning_feed');
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Feed belajar siswa tidak valid.');
  return data.map((row) => mapItem({ ...row, published: true }));
}

export function ringkasBelajarSiswa(items, submissions, now = new Date()) {
  if (!Array.isArray(items) || !Array.isArray(submissions)) {
    throw new TypeError('Data ringkasan belajar siswa tidak valid.');
  }
  const timestamp = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(timestamp)) throw new TypeError('Waktu ringkasan belajar siswa tidak valid.');

  const submittedTaskIds = new Set(submissions.map((submission) => submission.taskId));
  const schedules = items
    .filter((item) => item.kind === 'schedule' &&
      typeof item.startsAt === 'string' && Date.parse(item.startsAt) >= timestamp)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const pendingTasks = items
    .filter((item) => item.kind === 'task' && !submittedTaskIds.has(item.id))
    .sort((a, b) => {
      const parsedA = a.dueAt ? Date.parse(a.dueAt) : Number.NaN;
      const parsedB = b.dueAt ? Date.parse(b.dueAt) : Number.NaN;
      const dueA = Number.isFinite(parsedA) ? parsedA : Number.POSITIVE_INFINITY;
      const dueB = Number.isFinite(parsedB) ? parsedB : Number.POSITIVE_INFINITY;
      return dueA - dueB;
    });
  const pendingTaskDetails = pendingTasks.map((item) => {
    const dueAt = item.dueAt ? Date.parse(item.dueAt) : Number.NaN;
    return {
      ...item,
      overdue: Number.isFinite(dueAt) && dueAt < timestamp,
    };
  });
  const overdueTaskCount = pendingTaskDetails.filter((item) => item.overdue).length;

  return {
    scheduleCount: schedules.length,
    schedules: schedules.slice(0, 5),
    pendingTaskCount: pendingTasks.length,
    pendingTasks: pendingTaskDetails.slice(0, 5),
    overdueTaskCount,
  };
}

export async function buatJadwalMateri(tenantId, authorId, draft) {
  const values = payload(scope(tenantId), authorId, draft);
  const { data, error } = await supabase
    .from('school_learning_items')
    .insert(values)
    .select(FIELDS)
    .single();
  if (error) throw error;
  return mapItem(data);
}

export async function ubahJadwalMateri(tenantId, itemId, authorId, draft) {
  const school = scope(tenantId);
  if (typeof itemId !== 'string' || !itemId.trim()) {
    throw new TypeError('ID kegiatan belajar tidak valid.');
  }
  const values = payload(school, authorId, draft);
  const { tenant_id: _tenantId, author_id: _authorId, ...changes } = values;
  const { data, error } = await supabase
    .from('school_learning_items')
    .update(changes)
    .eq('tenant_id', school)
    .eq('id', itemId)
    .select(FIELDS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Jadwal atau materi tidak ditemukan atau akses sekolah berubah.');
  return mapItem(data);
}

export async function hapusJadwalMateri(tenantId, itemId) {
  const school = scope(tenantId);
  if (typeof itemId !== 'string' || !itemId.trim()) {
    throw new TypeError('ID kegiatan belajar tidak valid.');
  }
  const { data, error } = await supabase
    .from('school_learning_items')
    .delete()
    .eq('tenant_id', school)
    .eq('id', itemId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Jadwal atau materi tidak ditemukan atau akses sekolah berubah.');
}

function validateRpcRows(data, label) {
  if (!Array.isArray(data)) throw new Error(`${label} dari server tidak valid.`);
  return data;
}

export async function muatPengumpulanTugasSiswa() {
  const { data, error } = await supabase.rpc('student_school_task_submissions');
  if (error) throw error;
  return validateRpcRows(data, 'Riwayat pengumpulan').map((row) => {
    if (typeof row.task_id !== 'string' || typeof row.answer !== 'string' ||
        typeof row.submitted_at !== 'string') {
      throw new Error('Riwayat pengumpulan dari server tidak valid.');
    }
    return {
      taskId: row.task_id,
      answer: row.answer,
      submittedAt: row.submitted_at,
      feedback: row.feedback,
      reviewedAt: row.reviewed_at,
    };
  });
}

export async function kirimJawabanTugas(taskId, answer) {
  if (typeof taskId !== 'string' || !taskId.trim()) {
    throw new TypeError('ID tugas tidak valid.');
  }
  const response = text(answer, 'Jawaban', MAX_BODY, true);
  const { data, error } = await supabase.rpc('submit_school_task', {
    p_task_id: taskId,
    p_answer: response,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  if (!row || typeof row.submission_id !== 'string' || typeof row.submitted_at !== 'string') {
    throw new Error('Konfirmasi pengumpulan tugas dari server tidak valid.');
  }
  return { id: row.submission_id, submittedAt: row.submitted_at };
}

export async function muatPengumpulanTugasStaf(taskId) {
  if (typeof taskId !== 'string' || !taskId.trim()) {
    throw new TypeError('ID tugas tidak valid.');
  }
  const { data, error } = await supabase.rpc('school_task_submissions', {
    p_task_id: taskId,
  });
  if (error) throw error;
  return validateRpcRows(data, 'Daftar pengumpulan').map((row) => {
    if (typeof row.submission_id !== 'string' ||
        typeof row.student_name !== 'string' ||
        typeof row.class_name !== 'string' ||
        typeof row.answer !== 'string' ||
        typeof row.submitted_at !== 'string') {
      throw new Error('Daftar pengumpulan dari server tidak valid.');
    }
    return {
      id: row.submission_id,
      studentName: row.student_name,
      className: row.class_name,
      answer: row.answer,
      submittedAt: row.submitted_at,
      feedback: row.feedback,
      reviewedAt: row.reviewed_at,
    };
  });
}

export async function beriUmpanBalikTugas(submissionId, feedback) {
  if (typeof submissionId !== 'string' || !submissionId.trim()) {
    throw new TypeError('ID pengumpulan tidak valid.');
  }
  if (typeof feedback !== 'string' || feedback.trim().length > 5000) {
    throw new TypeError('Umpan balik maksimal 5000 karakter.');
  }
  const { error } = await supabase.rpc('review_school_task_submission', {
    p_submission_id: submissionId,
    p_feedback: feedback.trim() || null,
  });
  if (error) throw error;
}
