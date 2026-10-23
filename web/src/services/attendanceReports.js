import { supabase } from '../lib/supabase.ts';

export const ATTENDANCE_PAGE_SIZE = 100;

function normalizeDate(value) {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError('Tanggal presensi tidak valid.');
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new TypeError('Tanggal presensi tidak valid.');
  }
  return value;
}

export async function muatLaporanPresensi({
  date = '',
  className = '',
  search = '',
  offset = 0,
  limit = ATTENDANCE_PAGE_SIZE,
} = {}) {
  if (!Number.isInteger(offset) || offset < 0 || offset > 1000000) {
    throw new TypeError('Posisi halaman laporan tidak valid.');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new TypeError('Batas halaman laporan tidak valid.');
  }
  if (typeof className !== 'string' || className.trim() !== className || className.length > 30) {
    throw new TypeError('Nama kelas tidak valid.');
  }
  if (typeof search !== 'string' || search.trim() !== search || search.length > 100) {
    throw new TypeError('Pencarian siswa tidak valid.');
  }
  const { data, error } = await supabase.rpc('school_attendance_report', {
    p_attendance_date: normalizeDate(date),
    p_class_name: className || null,
    p_student_search: search || null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Laporan presensi dari server tidak valid.');
  return data.map((row) => {
    if (typeof row.id !== 'string' ||
        typeof row.student_id !== 'string' ||
        typeof row.student_name !== 'string' ||
        typeof row.class_name !== 'string' ||
        typeof row.attendance_date !== 'string' ||
        typeof row.attendance_status !== 'string' ||
        typeof row.recorded_at !== 'string') {
      throw new Error('Data laporan presensi dari server tidak valid.');
    }
    return {
      id: row.id,
      studentId: row.student_id,
      name: row.student_name,
      className: row.class_name,
      date: row.attendance_date,
      status: row.attendance_status,
      recordedAt: row.recorded_at,
    };
  });
}
