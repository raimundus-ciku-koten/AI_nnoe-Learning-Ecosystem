import { supabase } from '../lib/supabase.ts';

const METRIC_LABELS = new Map([
  ['classrooms_current', 'Ruang kelas terdaftar'],
  ['lesson_journals_30d', 'Jurnal mengajar · 30 hari'],
  ['attendance_sessions_30d', 'Sesi presensi · 30 hari'],
  ['assignments_30d', 'Tugas dibuat · 30 hari'],
  ['quizzes_30d', 'Kuis dibuat · 30 hari'],
]);

export async function muatRingkasanAktivitasLaporanSekolah() {
  const { data, error } = await supabase.rpc('school_admin_activity_report_overview');
  if (error) {
    console.error('[school-activity-report] Gagal memuat ringkasan tenant:', error);
    throw error;
  }
  if (!Array.isArray(data)
    || data.length !== METRIC_LABELS.size
    || data.some((row) => (
      !METRIC_LABELS.has(row?.metric_key)
      || !Number.isSafeInteger(Number(row.metric_value))
      || Number(row.metric_value) < 0
    ))
    || new Set(data.map((row) => row.metric_key)).size !== METRIC_LABELS.size) {
    throw new Error('Server mengembalikan ringkasan aktivitas sekolah yang tidak valid.');
  }
  return Object.fromEntries(data.map((row) => [
    row.metric_key,
    { label: METRIC_LABELS.get(row.metric_key), value: Number(row.metric_value) },
  ]));
}
