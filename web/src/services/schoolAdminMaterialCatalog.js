import { supabase } from '../lib/supabase.ts';

const MAX_ITEMS = 50;

function validTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

export async function muatKatalogMateriAdminSekolah() {
  const { data, error } = await supabase.rpc('school_admin_classroom_material_catalog');
  if (error) {
    console.error('[school-material-catalog] Gagal memuat katalog materi:', error);
    throw error;
  }
  if (!Array.isArray(data)
    || data.length > MAX_ITEMS
    || data.some((row) => (
      typeof row?.material_id !== 'string'
      || !row.material_id
      || typeof row.classroom_id !== 'string'
      || !row.classroom_id
      || typeof row.classroom_name !== 'string'
      || !row.classroom_name
      || typeof row.subject !== 'string'
      || typeof row.title !== 'string'
      || !row.title
      || !validTimestamp(row.created_at)
      || !validTimestamp(row.updated_at)
    ))
    || new Set(data.map((row) => row.material_id)).size !== data.length) {
    throw new Error('Server mengembalikan katalog materi yang tidak valid.');
  }
  return data.map((row) => ({
    id: row.material_id,
    classroomId: row.classroom_id,
    classroomName: row.classroom_name,
    subject: row.subject,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}
