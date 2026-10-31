import { supabase } from '../lib/supabase.ts';

const TENANT_FIELDS_BASE = 'id,name,npsn,headmaster_name,headmaster_nip,academic_year,semester';
const TENANT_FIELDS = `${TENANT_FIELDS_BASE},address,letterhead_object_path`;

function mapTenant(row, kopSuratTersedia = true) {
  return {
    tenantId: row.id,
    nama: row.name,
    npsn: row.npsn || '',
    kepalaSekolah: row.headmaster_name || '',
    nipKepalaSekolah: row.headmaster_nip || '',
    tahunAjaran: row.academic_year || '',
    semester: row.semester === 'genap' ? 'Genap' : 'Ganjil',
    alamat: row.address || '',
    kopSuratPath: row.letterhead_object_path || '',
    kopSuratTersedia,
  };
}

function kolomKopBelumAda(error) {
  const pesan = String(error?.message || '').toLowerCase();
  return ['42703', 'PGRST204'].includes(error?.code) ||
    (/(address|letterhead_object_path)/.test(pesan) && /(column|schema cache|field)/.test(pesan));
}

async function perbaruiTenant(tenantId, perubahan) {
  let { data, error } = await supabase.from('tenants')
    .update(perubahan)
    .eq('id', tenantId)
    .select(TENANT_FIELDS)
    .maybeSingle();
  let kopSuratTersedia = true;

  if (error && kolomKopBelumAda(error)) {
    const perubahanDasar = { ...perubahan };
    delete perubahanDasar.address;
    delete perubahanDasar.letterhead_object_path;
    ({ data, error } = await supabase.from('tenants')
      .update(perubahanDasar)
      .eq('id', tenantId)
      .select(TENANT_FIELDS_BASE)
      .maybeSingle());
    kopSuratTersedia = false;
  }
  if (error) throw error;
  if (!data) throw new Error('Pengaturan sekolah tidak tersimpan. Periksa peran dan akses tenant Anda.');
  return mapTenant(data, kopSuratTersedia);
}

function validasiKonteks(tenantId, userId) {
  if (!tenantId || !userId) {
    throw new Error('Akun belum terhubung ke sekolah yang valid.');
  }
}

export async function muatPengaturanTenant(tenantId) {
  if (!tenantId) throw new Error('Akun belum terhubung ke sekolah.');
  let { data, error } = await supabase
    .from('tenants')
    .select(TENANT_FIELDS)
    .eq('id', tenantId)
    .maybeSingle();
  let kopSuratTersedia = true;
  if (error && kolomKopBelumAda(error)) {
    ({ data, error } = await supabase.from('tenants')
      .select(TENANT_FIELDS_BASE)
      .eq('id', tenantId)
      .maybeSingle());
    kopSuratTersedia = false;
  }
  if (error) throw error;
  if (!data) throw new Error('Data sekolah tidak ditemukan atau aksesnya telah berubah.');
  return mapTenant(data, kopSuratTersedia);
}

export async function simpanProfilTenant(tenantId, userId, profile) {
  validasiKonteks(tenantId, userId);
  const nama = String(profile.nama || '').trim();
  if (!nama) throw new Error('Nama sekolah wajib diisi.');

  const perubahan = {
    name: nama,
    npsn: String(profile.npsn || '').trim() || null,
    headmaster_name: String(profile.kepalaSekolah || '').trim() || null,
    headmaster_nip: String(profile.nipKepalaSekolah || '').trim() || null,
    updated_by: userId,
  };
  if (profile.alamat !== undefined) perubahan.address = String(profile.alamat || '').trim() || null;
  return perbaruiTenant(tenantId, perubahan);
}

export async function simpanKopSuratTenant(tenantId, userId, objectPath) {
  validasiKonteks(tenantId, userId);
  const path = objectPath == null ? null : String(objectPath);
  if (path !== null && path !== `${tenantId}/letterhead`) {
    throw new TypeError('Lokasi kop surat tidak valid untuk tenant ini.');
  }
  const { data, error } = await supabase.from('tenants')
    .update({ letterhead_object_path: path, updated_by: userId })
    .eq('id', tenantId)
    .select(TENANT_FIELDS)
    .maybeSingle();
  if (error && kolomKopBelumAda(error)) {
    throw new Error('Pengelolaan kop belum aktif. Migration tenant letterhead perlu diverifikasi dan diterapkan terlebih dahulu.');
  }
  if (error) throw error;
  if (!data) throw new Error('Kop sekolah tidak tersimpan. Periksa peran dan akses tenant Anda.');
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

  return perbaruiTenant(tenantId, {
    academic_year: tahunAjaran,
    semester,
    updated_by: userId,
  });
}
