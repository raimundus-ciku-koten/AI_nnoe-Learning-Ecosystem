import { supabase } from '../lib/supabase.ts';

function daftarTersanitasi(values, maxLength) {
  if (!Array.isArray(values)) return [];
  const normalized = values
    .filter((value) => typeof value === 'string')
    .map((value) => value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength))
    .filter(Boolean);
  return [...new Set(normalized)]
    .sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));
}

export async function muatPenugasanGuru(userId) {
  if (!userId) throw new Error('ID pengguna wajib diisi.');
  const { data, error } = await supabase
    .from('profiles')
    .select('mapel_ids,kelas_ids')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Penugasan pengguna tidak ditemukan atau aksesnya berubah.');

  return {
    mapel: daftarTersanitasi(data.mapel_ids, 80),
    kelas: daftarTersanitasi(data.kelas_ids, 30),
  };
}
