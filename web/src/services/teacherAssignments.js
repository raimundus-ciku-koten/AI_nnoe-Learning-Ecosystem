import { supabase } from '../lib/supabase.ts';

const ROLES_GURU = ['guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'];

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

export async function muatGuruTenant(tenantId) {
  if (!tenantId) throw new Error('Tenant sekolah wajib tersedia.');
  const { data, error } = await supabase
    .from('profiles')
    .select('id,nama,email,role,mapel_ids,kelas_ids,active')
    .eq('tenant_id', tenantId)
    .eq('active', true)
    .in('role', ROLES_GURU)
    .order('nama')
    .limit(200);
  if (error) throw error;
  return (data || []).map((profile) => ({
    uid: profile.id,
    nama: String(profile.nama || profile.email || 'Guru').trim(),
    email: String(profile.email || '').trim(),
    role: profile.role,
    mapel: daftarTersanitasi(profile.mapel_ids, 120),
    kelas: daftarTersanitasi(profile.kelas_ids, 120),
  }));
}

function daftarValid(values, label) {
  if (!Array.isArray(values) || values.length > 30) {
    throw new TypeError(`${label} maksimal 30 item.`);
  }
  const normalized = values.map((value) => {
    if (typeof value !== 'string') throw new TypeError(`${label} tidak valid.`);
    const item = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!item || item.length > 120) throw new TypeError(`${label} wajib berisi 1-120 karakter.`);
    return item;
  });
  if (new Set(normalized.map((item) => item.toLocaleLowerCase('id'))).size !== normalized.length) {
    throw new TypeError(`${label} tidak boleh duplikat.`);
  }
  return normalized;
}

export async function simpanPenugasanGuru({ userId, mapel, kelas }) {
  if (typeof userId !== 'string' || !userId) throw new TypeError('Pilih guru yang valid.');
  const mapelIds = daftarValid(mapel, 'Mata pelajaran');
  const kelasIds = daftarValid(kelas, 'Kelas');
  const { data, error } = await supabase.rpc('manage_school_teacher_assignments', {
    p_user_id: userId,
    p_mapel_ids: mapelIds,
    p_kelas_ids: kelasIds,
  });
  if (error) throw error;
  return data;
}
