import {
  isSupabaseConfigured,
  supabase,
  supabaseConfigError,
} from '../lib/supabase.ts';
const TABLE = 'learning_classroom_journals';
const TEACHER_ROLES = new Set([
  'guru',
  'guru_bk',
  'guru_kokurikuler',
  'guru_ekstrakurikuler',
]);
const COLUMNS = 'id,classroom_id,tenant_id,author_id,lesson_date,topic,objectives,activities,reflection,follow_up,planning_package_id,planning_document_type,planning_unit,created_at,updated_at';
const LIMIT_PER_CLASS = 100;
const PLANNING_TYPES = new Set(['rpe', 'atp', 'prota', 'prosem', 'kktp', 'modul']);

function ensureSupabase() {
  if (!isSupabaseConfigured) {
    throw new Error(
      supabaseConfigError?.message ||
      'Supabase belum dikonfigurasi; jurnal mengajar tidak tersedia.',
    );
  }
}

function validateContext(context) {
  const role = context?.activeRole || context?.role;
  if (!context?.userId || typeof context.userId !== 'string') {
    throw new Error('Sesi pengguna tidak valid. Silakan masuk kembali.');
  }
  if (!TEACHER_ROLES.has(role)) {
    throw new Error('Jurnal mengajar hanya tersedia bagi guru yang ditugaskan.');
  }
  if (typeof context.tenantId !== 'string' || !context.tenantId.trim()) {
    throw new Error('Sekolah aktif tidak ditemukan. Pilih sekolah sebelum melanjutkan.');
  }
  return { role, tenantId: context.tenantId };
}

function validateClassroom(classroomId) {
  if (typeof classroomId !== 'string' || !classroomId.trim()) {
    throw new TypeError('Pilih ruang kelas yang valid.');
  }
}

function isRealDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateInput(input) {
  const lessonDate = typeof input?.lessonDate === 'string' ? input.lessonDate : '';
  const topic = typeof input?.topic === 'string' ? input.topic.trim() : '';
  const objectives = typeof input?.objectives === 'string' ? input.objectives.trim() : '';
  const activities = typeof input?.activities === 'string' ? input.activities.trim() : '';
  const reflection = typeof input?.reflection === 'string' ? input.reflection.trim() : '';
  const followUp = typeof input?.followUp === 'string' ? input.followUp.trim() : '';
  const planningRef = input?.planningRef ?? null;
  if (!isRealDate(lessonDate)) {
    throw new TypeError('Tanggal pembelajaran tidak valid.');
  }
  if (!topic || topic.length > 200) {
    throw new TypeError('Topik wajib diisi dan maksimal 200 karakter.');
  }
  if (!objectives || objectives.length > 3000) {
    throw new TypeError('Tujuan pembelajaran wajib diisi dan maksimal 3.000 karakter.');
  }
  if (!activities || activities.length > 6000) {
    throw new TypeError('Aktivitas wajib diisi dan maksimal 6.000 karakter.');
  }
  if (reflection.length > 4000 || followUp.length > 4000) {
    throw new TypeError('Refleksi dan tindak lanjut maksimal 4.000 karakter.');
  }
  if (planningRef !== null && (
    typeof planningRef !== 'object' ||
    typeof planningRef.packageId !== 'string' ||
    planningRef.packageId.trim().length < 1 ||
    planningRef.packageId.trim().length > 120 ||
    !PLANNING_TYPES.has(planningRef.documentType) ||
    (planningRef.documentType === 'modul'
      ? typeof planningRef.unit !== 'string' ||
        planningRef.unit.trim().length < 1 ||
        planningRef.unit.trim().length > 80
      : planningRef.unit !== null && planningRef.unit !== undefined && planningRef.unit !== '')
  )) {
    throw new TypeError('Referensi dokumen perencanaan tidak valid.');
  }
  return {
    lessonDate,
    topic,
    objectives,
    activities,
    reflection,
    followUp,
    planningRef: planningRef ? {
      packageId: planningRef.packageId.trim(),
      documentType: planningRef.documentType,
      unit: planningRef.documentType === 'modul' ? planningRef.unit.trim() : null,
    } : null,
  };
}

function fromRow(row, tenantId, classroomId) {
  if (!row || typeof row.id !== 'string' ||
      row.tenant_id !== tenantId ||
      row.classroom_id !== classroomId ||
      typeof row.author_id !== 'string' ||
      !isRealDate(row.lesson_date) ||
      typeof row.topic !== 'string' ||
      typeof row.objectives !== 'string' ||
      typeof row.activities !== 'string' ||
      typeof row.reflection !== 'string' ||
      typeof row.follow_up !== 'string' ||
      (row.planning_package_id !== null && typeof row.planning_package_id !== 'string') ||
      (row.planning_document_type !== null && !PLANNING_TYPES.has(row.planning_document_type)) ||
      (row.planning_unit !== null && typeof row.planning_unit !== 'string') ||
      (row.planning_package_id === null) !== (row.planning_document_type === null) ||
      (row.planning_package_id === null) !== (row.planning_unit === null &&
        row.planning_document_type !== 'modul') ||
      typeof row.created_at !== 'string' ||
      typeof row.updated_at !== 'string' ||
      !Number.isFinite(Date.parse(row.created_at)) ||
      !Number.isFinite(Date.parse(row.updated_at))) {
    throw new Error('Supabase mengembalikan data jurnal mengajar yang tidak valid.');
  }
  return {
    id: row.id,
    classroomId: row.classroom_id,
    tenantId: row.tenant_id,
    authorId: row.author_id,
    lessonDate: row.lesson_date,
    topic: row.topic,
    objectives: row.objectives,
    activities: row.activities,
    reflection: row.reflection,
    followUp: row.follow_up,
    planningRef: row.planning_package_id ? {
      packageId: row.planning_package_id,
      documentType: row.planning_document_type,
      unit: row.planning_unit,
    } : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function ensureSuccess({ data, error }, action) {
  if (error) throw new Error(`Gagal ${action}: ${error.message}`);
  return data;
}

export async function listClassroomJournals(context, classroomId) {
  ensureSupabase();
  const { tenantId } = validateContext(context);
  validateClassroom(classroomId);
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('classroom_id', classroomId)
    .eq('author_id', context.userId)
    .order('lesson_date', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(LIMIT_PER_CLASS);
  const rows = ensureSuccess({ data, error }, 'memuat jurnal kelas');
  if (!Array.isArray(rows)) throw new Error('Supabase tidak mengembalikan daftar jurnal.');
  return rows.map((row) => fromRow(row, tenantId, classroomId));
}

export async function createClassroomJournal(context, classroomId, input) {
  ensureSupabase();
  const { tenantId } = validateContext(context);
  validateClassroom(classroomId);
  const value = validateInput(input);
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      classroom_id: classroomId,
      tenant_id: tenantId,
      author_id: context.userId,
      lesson_date: value.lessonDate,
      topic: value.topic,
      objectives: value.objectives,
      activities: value.activities,
      reflection: value.reflection,
      follow_up: value.followUp,
      planning_package_id: value.planningRef?.packageId ?? null,
      planning_document_type: value.planningRef?.documentType ?? null,
      planning_unit: value.planningRef?.unit ?? null,
    })
    .select(COLUMNS)
    .single();
  return fromRow(ensureSuccess({ data, error }, 'menyimpan jurnal'), tenantId, classroomId);
}

export async function updateClassroomJournal(context, classroomId, journalId, input) {
  ensureSupabase();
  const { tenantId } = validateContext(context);
  validateClassroom(classroomId);
  if (typeof journalId !== 'string' || !journalId.trim()) {
    throw new TypeError('Identitas jurnal tidak valid.');
  }
  const value = validateInput(input);
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      lesson_date: value.lessonDate,
      topic: value.topic,
      objectives: value.objectives,
      activities: value.activities,
      reflection: value.reflection,
      follow_up: value.followUp,
      planning_package_id: value.planningRef?.packageId ?? null,
      planning_document_type: value.planningRef?.documentType ?? null,
      planning_unit: value.planningRef?.unit ?? null,
    })
    .eq('id', journalId)
    .eq('tenant_id', tenantId)
    .eq('classroom_id', classroomId)
    .eq('author_id', context.userId)
    .select(COLUMNS)
    .single();
  return fromRow(ensureSuccess({ data, error }, 'memperbarui jurnal'), tenantId, classroomId);
}

export async function deleteClassroomJournal(context, classroomId, journalId) {
  ensureSupabase();
  const { tenantId } = validateContext(context);
  validateClassroom(classroomId);
  if (typeof journalId !== 'string' || !journalId.trim()) {
    throw new TypeError('Identitas jurnal tidak valid.');
  }
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', journalId)
    .eq('tenant_id', tenantId)
    .eq('classroom_id', classroomId)
    .eq('author_id', context.userId);
  if (error) throw new Error(`Gagal menghapus jurnal: ${error.message}`);
}
