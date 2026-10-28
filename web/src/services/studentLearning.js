import { supabase } from '../lib/supabase.ts';

const JADWAL_COLUMNS = 'id,tenant_id,owner_id,kelas,day_of_week,starts_at,ends_at,mapel,ruang,updated_at';
const MATERI_COLUMNS = 'id,tenant_id,owner_id,kelas,mapel,title,description,resource_url,updated_at';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JAM = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function wajibString(value, label, max, required = true) {
  if (typeof value !== 'string') throw new TypeError(`${label} tidak valid.`);
  const clean = value.trim();
  if ((required && !clean) || clean.length > max) {
    throw new TypeError(`${label} ${required ? 'wajib diisi dan ' : ''}maksimal ${max} karakter.`);
  }
  return clean;
}

function wajibIdentitas(tenantId, ownerId) {
  if (typeof tenantId !== 'string' || !tenantId.trim() || !UUID.test(ownerId || '')) {
    throw new TypeError('Identitas sekolah atau guru tidak valid.');
  }
}

function validasiJadwal(input) {
  const kelas = wajibString(input.kelas, 'Kelas', 30);
  const mapel = wajibString(input.mapel, 'Mata pelajaran', 80);
  const ruang = wajibString(input.ruang || '', 'Ruang', 80, false);
  if (!Number.isInteger(input.dayOfWeek) || input.dayOfWeek < 1 || input.dayOfWeek > 7 ||
      !JAM.test(input.startsAt || '') || !JAM.test(input.endsAt || '') ||
      input.endsAt <= input.startsAt) {
    throw new TypeError('Hari atau rentang waktu jadwal tidak valid.');
  }
  return {
    kelas,
    mapel,
    ruang,
    day_of_week: input.dayOfWeek,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
  };
}

function validasiMateri(input) {
  const resourceUrl = wajibString(input.resourceUrl, 'Tautan materi', 2048);
  let url;
  try {
    url = new URL(resourceUrl);
  } catch {
    throw new TypeError('Tautan materi harus berupa URL HTTPS yang valid.');
  }
  if (url.protocol !== 'https:') {
    throw new TypeError('Tautan materi harus menggunakan HTTPS.');
  }
  return {
    kelas: wajibString(input.kelas, 'Kelas', 30),
    mapel: wajibString(input.mapel, 'Mata pelajaran', 80),
    title: wajibString(input.title, 'Judul materi', 160),
    description: wajibString(input.description || '', 'Deskripsi', 2000, false),
    resource_url: url.toString(),
  };
}

async function daftarRpc(nama) {
  const { data, error } = await supabase.rpc(nama);
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error(`Respons ${nama} dari server tidak valid.`);
  return data;
}

export async function muatJadwalSiswa() {
  return daftarRpc('student_learning_schedule');
}

export async function muatMateriSiswa() {
  return daftarRpc('student_learning_materials');
}

export async function muatRuangBelajarGuru(tenantId, ownerId) {
  wajibIdentitas(tenantId, ownerId);
  const [schedule, materials] = await Promise.all([
    supabase.from('student_class_schedule').select(JADWAL_COLUMNS)
      .eq('tenant_id', tenantId).eq('owner_id', ownerId)
      .order('day_of_week').order('starts_at').limit(200),
    supabase.from('student_learning_materials').select(MATERI_COLUMNS)
      .eq('tenant_id', tenantId).eq('owner_id', ownerId)
      .order('updated_at', { ascending: false }).limit(200),
  ]);
  if (schedule.error) throw schedule.error;
  if (materials.error) throw materials.error;
  if (!Array.isArray(schedule.data) || !Array.isArray(materials.data)) {
    throw new Error('Daftar jadwal atau materi dari server tidak valid.');
  }
  return { schedule: schedule.data, materials: materials.data };
}

export async function tambahJadwalSiswa(tenantId, ownerId, input) {
  wajibIdentitas(tenantId, ownerId);
  const jadwal = validasiJadwal(input);
  const { data, error } = await supabase.from('student_class_schedule')
    .insert({ tenant_id: tenantId, owner_id: ownerId, ...jadwal })
    .select(JADWAL_COLUMNS).single();
  if (error) throw error;
  if (!data) throw new Error('Server tidak mengembalikan jadwal yang baru disimpan.');
  return data;
}

export async function ubahJadwalSiswa(tenantId, ownerId, id, input) {
  wajibIdentitas(tenantId, ownerId);
  if (!UUID.test(id || '')) throw new TypeError('ID jadwal tidak valid.');
  const jadwal = validasiJadwal(input);
  const { data, error } = await supabase.from('student_class_schedule')
    .update(jadwal)
    .eq('tenant_id', tenantId).eq('owner_id', ownerId).eq('id', id)
    .select(JADWAL_COLUMNS).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Jadwal tidak ditemukan atau aksesnya telah berubah.');
  return data;
}

export async function hapusJadwalSiswa(tenantId, ownerId, id) {
  wajibIdentitas(tenantId, ownerId);
  if (!UUID.test(id || '')) throw new TypeError('ID jadwal tidak valid.');
  const { data, error } = await supabase.from('student_class_schedule').delete()
    .eq('tenant_id', tenantId).eq('owner_id', ownerId).eq('id', id)
    .select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Jadwal tidak ditemukan atau aksesnya telah berubah.');
}

export async function tambahMateriSiswa(tenantId, ownerId, input) {
  wajibIdentitas(tenantId, ownerId);
  const material = validasiMateri(input);
  const { data, error } = await supabase.from('student_learning_materials')
    .insert({ tenant_id: tenantId, owner_id: ownerId, ...material })
    .select(MATERI_COLUMNS).single();
  if (error) throw error;
  if (!data) throw new Error('Server tidak mengembalikan materi yang baru disimpan.');
  return data;
}

export async function ubahMateriSiswa(tenantId, ownerId, id, input) {
  wajibIdentitas(tenantId, ownerId);
  if (!UUID.test(id || '')) throw new TypeError('ID materi tidak valid.');
  const material = validasiMateri(input);
  const { data, error } = await supabase.from('student_learning_materials')
    .update(material)
    .eq('tenant_id', tenantId).eq('owner_id', ownerId).eq('id', id)
    .select(MATERI_COLUMNS).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Materi tidak ditemukan atau aksesnya telah berubah.');
  return data;
}

export async function hapusMateriSiswa(tenantId, ownerId, id) {
  wajibIdentitas(tenantId, ownerId);
  if (!UUID.test(id || '')) throw new TypeError('ID materi tidak valid.');
  const { data, error } = await supabase.from('student_learning_materials').delete()
    .eq('tenant_id', tenantId).eq('owner_id', ownerId).eq('id', id)
    .select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Materi tidak ditemukan atau aksesnya telah berubah.');
}
