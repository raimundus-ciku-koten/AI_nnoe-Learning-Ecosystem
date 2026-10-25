import { supabase } from '../lib/supabase.ts';

const METRICS = new Map([
  ['classroom_materials_current', 'Materi ruang kelas tersimpan'],
  ['classroom_materials_30d', 'Materi ditambahkan · 30 hari'],
  ['school_announcements_30d', 'Pengumuman dibuat · 30 hari'],
]);

export async function muatRingkasanKontenSekolah() {
  const { data, error } = await supabase.rpc('school_admin_content_overview');
  if (error) {
    console.error('[school-content-overview] Gagal memuat ringkasan konten tenant:', error);
    throw error;
  }
  if (!Array.isArray(data)
    || data.length !== METRICS.size
    || data.some((row) => (
      !METRICS.has(row?.metric_key)
      || !Number.isSafeInteger(Number(row.metric_value))
      || Number(row.metric_value) < 0
    ))
    || new Set(data.map((row) => row.metric_key)).size !== METRICS.size) {
    throw new Error('Server mengembalikan ringkasan konten sekolah yang tidak valid.');
  }
  return Object.fromEntries(data.map((row) => [
    row.metric_key,
    { label: METRICS.get(row.metric_key), value: Number(row.metric_value) },
  ]));
}
