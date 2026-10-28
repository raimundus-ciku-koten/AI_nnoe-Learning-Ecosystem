import { supabase } from '../lib/supabase.ts';

const ACTIVITY_LABELS = new Map([
  ['announcement', 'Pengumuman sekolah dibuat'],
  ['classroom', 'Ruang kelas dibuat'],
  ['assignment', 'Tugas ruang kelas dibuat'],
  ['quiz', 'Kuis ruang kelas dibuat'],
  ['online_exam', 'Ujian online dijadwalkan'],
  ['guardian_link', 'Status verifikasi wali-siswa diperbarui'],
]);

const CHAT_METRICS = new Set([
  'conversations_created_30d',
  'messages_7d',
  'active_senders_30d',
]);

function throwOnError(error, message) {
  if (error) {
    console.error(`[school-activity-overview] ${message}:`, error);
    throw error;
  }
}

export async function muatAktivitasTerbaruSekolah() {
  const { data, error } = await supabase.rpc('school_admin_recent_activity');
  throwOnError(error, 'Gagal memuat aktivitas tenant');
  if (!Array.isArray(data) || data.length > 100 || data.some((row) => (
    !ACTIVITY_LABELS.has(row?.event_key)
    || row.event_label !== ACTIVITY_LABELS.get(row.event_key)
    || typeof row.occurred_at !== 'string'
    || Number.isNaN(Date.parse(row.occurred_at))
  ))) {
    throw new Error('Server mengembalikan aktivitas tenant yang tidak valid.');
  }
  return data;
}

export async function muatRingkasanChatSekolah() {
  const { data, error } = await supabase.rpc('school_admin_chat_overview');
  throwOnError(error, 'Gagal memuat ringkasan chat tenant');
  if (!Array.isArray(data)
    || data.length !== CHAT_METRICS.size
    || data.some((row) => (
      !CHAT_METRICS.has(row?.metric_key)
      || !Number.isSafeInteger(Number(row.metric_value))
      || Number(row.metric_value) < 0
    ))
    || new Set(data.map((row) => row.metric_key)).size !== CHAT_METRICS.size) {
    throw new Error('Server mengembalikan ringkasan chat tenant yang tidak valid.');
  }
  return Object.fromEntries(data.map((row) => [row.metric_key, Number(row.metric_value)]));
}
