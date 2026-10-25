import { supabase } from '../lib/supabase.ts';

const FIELD_TYPES = {
  exam_id: 'string',
  title: 'string',
  kelas: 'string',
  starts_at: 'string',
  ends_at: 'string',
  duration_minutes: 'number',
  status: 'string',
  question_count: 'number',
  participant_count: 'number',
  submitted_count: 'number',
  pending_review_count: 'number',
};

function isValidRow(row) {
  const countFields = [
    'duration_minutes',
    'question_count',
    'participant_count',
    'submitted_count',
    'pending_review_count',
  ];
  return row && Object.entries(FIELD_TYPES).every(([field, type]) => (
    typeof row[field] === type
  )) && ['active', 'closed'].includes(row.status)
    && countFields.every((field) => Number.isSafeInteger(row[field]) && row[field] >= 0)
    && !Number.isNaN(Date.parse(row.starts_at))
    && !Number.isNaN(Date.parse(row.ends_at));
}

export async function muatRingkasanAsesmenSekolah() {
  const { data, error } = await supabase.rpc('school_admin_online_exam_overview');
  if (error) {
    console.error('[school-assessment-overview] Gagal memuat ringkasan asesmen:', error);
    throw error;
  }
  if (!Array.isArray(data) || data.some((row) => !isValidRow(row))) {
    throw new Error('Server mengembalikan ringkasan asesmen yang tidak valid.');
  }
  return data;
}
