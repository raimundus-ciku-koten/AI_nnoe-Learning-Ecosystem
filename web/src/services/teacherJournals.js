import { supabase } from '../lib/supabase.ts';

const FIELDS = 'id,tenant_id,author_id,class_name,subject,lesson_date,topic,learning_objective,activities,reflection,follow_up,status,created_at,updated_at';
const ROLES = new Set(['guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler']);

function scope(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} belum tersedia.`);
  return value.trim();
}

function cleanText(value, label, max, required = false) {
  if (typeof value !== 'string') throw new TypeError(`${label} harus berupa teks.`);
  const result = value.trim();
  if ((required && !result) || result.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result)) {
    throw new TypeError(`${label} ${required ? 'wajib diisi dan ' : ''}maksimal ${max} karakter.`);
  }
  return result;
}

function cleanDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError('Tanggal jurnal tidak valid.');
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new TypeError('Tanggal jurnal tidak valid.');
  }
  return value;
}

function mapJournal(row) {
  if (!row || typeof row.id !== 'string' || typeof row.tenant_id !== 'string' ||
      typeof row.author_id !== 'string' || typeof row.class_name !== 'string' ||
      typeof row.subject !== 'string' || typeof row.lesson_date !== 'string' ||
      typeof row.topic !== 'string' || typeof row.learning_objective !== 'string' ||
      typeof row.activities !== 'string' || typeof row.reflection !== 'string' ||
      typeof row.follow_up !== 'string' || !['draf', 'selesai'].includes(row.status)) {
    throw new Error('Data jurnal mengajar dari server tidak valid.');
  }
  return {
    id: row.id,
    tenantId: row.tenant_id,
    authorId: row.author_id,
    className: row.class_name,
    subject: row.subject,
    date: row.lesson_date,
    topic: row.topic,
    learningObjective: row.learning_objective,
    activities: row.activities,
    reflection: row.reflection,
    followUp: row.follow_up,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function payload(draft) {
  if (!draft || !['draf', 'selesai'].includes(draft.status)) {
    throw new TypeError('Status jurnal tidak valid.');
  }
  return {
    class_name: cleanText(draft.className, 'Kelas', 30, true),
    subject: cleanText(draft.subject, 'Mata pelajaran', 100, true),
    lesson_date: cleanDate(draft.date),
    topic: cleanText(draft.topic, 'Topik pembelajaran', 200, true),
    learning_objective: cleanText(draft.learningObjective, 'Tujuan pembelajaran', 2000, true),
    activities: cleanText(draft.activities, 'Kegiatan pembelajaran', 6000, true),
    reflection: cleanText(draft.reflection ?? '', 'Refleksi', 4000),
    follow_up: cleanText(draft.followUp ?? '', 'Tindak lanjut', 4000),
    status: draft.status,
  };
}

export async function muatKelasRosterGuru(tenantId, ownerId) {
  const tenant = scope(tenantId, 'Sekolah aktif');
  const owner = scope(ownerId, 'Akun guru');
  const { data, error } = await supabase
    .from('students')
    .select('kelas')
    .eq('tenant_id', tenant)
    .eq('owner_id', owner)
    .order('kelas', { ascending: true })
    .limit(2000);
  if (error) throw error;
  if (!Array.isArray(data) || data.some((row) => typeof row.kelas !== 'string')) {
    throw new Error('Daftar kelas roster dari server tidak valid.');
  }
  return [...new Set(data.map((row) => row.kelas.trim()).filter(Boolean))];
}

export async function muatJurnalMengajar(tenantId, ownerId) {
  const { data, error } = await supabase
    .from('school_teacher_journals')
    .select(FIELDS)
    .eq('tenant_id', scope(tenantId, 'Sekolah aktif'))
    .eq('author_id', scope(ownerId, 'Akun guru'))
    .order('lesson_date', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Daftar jurnal mengajar tidak valid.');
  return data.map(mapJournal);
}

export async function simpanJurnalMengajar(tenantId, ownerId, draft) {
  const tenant = scope(tenantId, 'Sekolah aktif');
  const owner = scope(ownerId, 'Akun guru');
  const values = payload(draft);
  const { data, error } = await supabase
    .from('school_teacher_journals')
    .insert({ ...values, tenant_id: tenant, author_id: owner })
    .select(FIELDS)
    .single();
  if (error) throw error;
  return mapJournal(data);
}

export async function ubahJurnalMengajar(tenantId, ownerId, journalId, draft) {
  const tenant = scope(tenantId, 'Sekolah aktif');
  const owner = scope(ownerId, 'Akun guru');
  if (typeof journalId !== 'string' || !journalId.trim()) {
    throw new TypeError('ID jurnal tidak valid.');
  }
  const { data, error } = await supabase
    .from('school_teacher_journals')
    .update(payload(draft))
    .eq('tenant_id', tenant)
    .eq('author_id', owner)
    .eq('id', journalId)
    .select(FIELDS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Jurnal tidak ditemukan atau akses sekolah berubah.');
  return mapJournal(data);
}

export async function hapusJurnalMengajar(tenantId, ownerId, journalId) {
  const tenant = scope(tenantId, 'Sekolah aktif');
  const owner = scope(ownerId, 'Akun guru');
  if (typeof journalId !== 'string' || !journalId.trim()) {
    throw new TypeError('ID jurnal tidak valid.');
  }
  const { data, error } = await supabase
    .from('school_teacher_journals')
    .delete()
    .eq('tenant_id', tenant)
    .eq('author_id', owner)
    .eq('id', journalId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Jurnal tidak ditemukan atau akses sekolah berubah.');
}

export function roleDapatMengelolaJurnal(role) {
  return ROLES.has(role);
}
