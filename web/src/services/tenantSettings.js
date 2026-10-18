import { supabase } from '../lib/supabase.ts';

const TENANT_FIELDS = 'id,name,npsn,headmaster_name,headmaster_nip,academic_year,semester';

function mapTenant(row) {
  return {
    tenantId: row.id,
    nama: row.name,
    npsn: row.npsn || '',
    kepalaSekolah: row.headmaster_name || '',
    nipKepalaSekolah: row.headmaster_nip || '',
    tahunAjaran: row.academic_year || '',
    semester: row.semester === 'genap' ? 'Genap' : 'Ganjil',
  };
}

function validasiKonteks(tenantId, userId) {
  if (!tenantId || !userId) {
    throw new Error('Akun belum terhubung ke sekolah yang valid.');
  }
}

export async function muatPengaturanTenant(tenantId) {
  if (!tenantId) throw new Error('Akun belum terhubung ke sekolah.');
  const { data, error } = await supabase
    .from('tenants')
    .select(TENANT_FIELDS)
    .eq('id', tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Data sekolah tidak ditemukan atau aksesnya telah berubah.');
  return mapTenant(data);
}

export async function simpanProfilTenant(tenantId, userId, profile) {
  validasiKonteks(tenantId, userId);
  const nama = String(profile.nama || '').trim();
  if (!nama) throw new Error('Nama sekolah wajib diisi.');

  const { data, error } = await supabase
    .from('tenants')
    .update({
      name: nama,
      npsn: String(profile.npsn || '').trim() || null,
      headmaster_name: String(profile.kepalaSekolah || '').trim() || null,
      headmaster_nip: String(profile.nipKepalaSekolah || '').trim() || null,
      updated_by: userId,
    })
    .eq('id', tenantId)
    .select(TENANT_FIELDS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Profil sekolah tidak tersimpan. Periksa peran dan akses tenant Anda.');
  return mapTenant(data);
}

export async function simpanSiklusTenant(tenantId, userId, settings) {
  validasiKonteks(tenantId, userId);
  const tahunAjaran = String(settings.tahunAjaran || '').trim();
  const tahun = /^(\d{4})\/(\d{4})$/.exec(tahunAjaran);
  if (!tahun || Number(tahun[2]) !== Number(tahun[1]) + 1) {
    throw new Error('Format tahun ajaran harus seperti 2026/2027.');
  }
  const semester = String(settings.semester || '').toLowerCase();
  if (!['ganjil', 'genap'].includes(semester)) {
    throw new Error('Semester tidak valid.');
  }

  const { data, error } = await supabase
    .from('tenants')
    .update({
      academic_year: tahunAjaran,
      semester,
      updated_by: userId,
    })
    .eq('id', tenantId)
    .select(TENANT_FIELDS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Siklus akademik tidak tersimpan. Periksa peran dan akses tenant Anda.');
  return mapTenant(data);
}
