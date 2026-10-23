import { supabase } from '../lib/supabase.ts';

export async function muatRiwayatKehadiranSiswa() {
  const { data, error } = await supabase.rpc('student_attendance_history');
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Riwayat kehadiran dari server tidak valid.');
  return data.map((row) => {
    if (typeof row.attendance_date !== 'string' ||
        typeof row.attendance_status !== 'string' ||
        typeof row.class_name !== 'string' ||
        typeof row.recorded_at !== 'string') {
      throw new Error('Data riwayat kehadiran dari server tidak valid.');
    }
    return {
      date: row.attendance_date,
      status: row.attendance_status,
      recordedAt: row.recorded_at,
      className: row.class_name,
    };
  });
}

export function ringkasKehadiranSiswa(records) {
  if (!Array.isArray(records)) throw new TypeError('Data ringkasan kehadiran tidak valid.');
  const latest = [...records].sort((a, b) =>
    b.date.localeCompare(a.date) || b.recordedAt.localeCompare(a.recordedAt))[0] || null;
  return { recordCount: records.length, latest };
}
