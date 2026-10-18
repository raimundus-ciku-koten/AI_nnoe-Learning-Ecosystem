import { supabase } from '../lib/supabase.ts';

const BATCH_SIZE = 200;

function validasiKepemilikan(student) {
  if (!student.ownerId || !student.tenantId) {
    throw new Error('Data siswa harus memiliki pemilik dan sekolah aktif.');
  }
}

function dariBaris(row) {
  const origin = globalThis.location?.origin || 'https://ainnoe.app';
  const pathname = globalThis.location?.pathname?.replace(/\/[^/]*$/, '/') || '/';
  return {
    id: row.id,
    nama: row.nama,
    kelas: row.kelas,
    nisn: row.nisn || '',
    jk: row.jk || '',
    kodeUnik: row.kode_unik,
    urlScan: `${origin.replace(/\/+$/, '')}${pathname}#/scan/${encodeURIComponent(row.kode_unik)}`,
    dibuat: row.created_at,
    diperbarui: row.updated_at,
  };
}

export async function muatSiswa(ownerId) {
  if (!ownerId) throw new Error('Pengguna belum masuk.');
  const { data, error } = await supabase
    .from('students')
    .select('id,nama,kelas,nisn,jk,kode_unik,created_at,updated_at')
    .eq('owner_id', ownerId)
    .order('nama');
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Supabase tidak mengembalikan daftar siswa yang valid.');
  return data.map(dariBaris);
}

export async function tambahSiswa(student) {
  validasiKepemilikan(student);
  const { data, error } = await supabase
    .from('students')
    .insert({
      tenant_id: student.tenantId,
      owner_id: student.ownerId,
      nama: student.nama,
      kelas: student.kelas,
      nisn: student.nisn || null,
      jk: student.jk || null,
      kode_unik: student.kodeUnik,
    })
    .select('id,nama,kelas,nisn,jk,kode_unik,created_at,updated_at')
    .single();
  if (error) throw error;
  return dariBaris(data);
}

export async function ubahSiswa(ownerId, id, changes) {
  const { data, error } = await supabase
    .from('students')
    .update({
      nama: changes.nama,
      kelas: changes.kelas,
      nisn: changes.nisn || null,
      jk: changes.jk || null,
    })
    .eq('owner_id', ownerId)
    .eq('id', id)
    .select('id,nama,kelas,nisn,jk,kode_unik,created_at,updated_at')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Data siswa tidak ditemukan atau aksesnya telah berubah.');
  return dariBaris(data);
}

export async function tambahBanyakSiswa(students) {
  if (!students.length) return [];
  const saved = [];
  for (let offset = 0; offset < students.length; offset += BATCH_SIZE) {
    const batch = students.slice(offset, offset + BATCH_SIZE);
    batch.forEach(validasiKepemilikan);
    const { data, error } = await supabase.from('students')
      .insert(batch.map((student) => ({
        tenant_id: student.tenantId,
        owner_id: student.ownerId,
        nama: student.nama,
        kelas: student.kelas,
        nisn: student.nisn || null,
        jk: student.jk || null,
        kode_unik: student.kodeUnik,
      })))
      .select('id,nama,kelas,nisn,jk,kode_unik,created_at,updated_at');
    if (error) {
      error.jumlahTertulis = saved.length;
      throw error;
    }
    if (!data || data.length !== batch.length) {
      const errorPengembalian = new Error('Supabase tidak mengembalikan seluruh siswa yang baru disimpan.');
      errorPengembalian.jumlahTertulis = saved.length + (data?.length || 0);
      throw errorPengembalian;
    }
    saved.push(...data.map(dariBaris));
  }
  return saved;
}

export async function hapusBanyakSiswa(ownerId, ids) {
  let deleted = 0;
  for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
    const batch = ids.slice(offset, offset + BATCH_SIZE);
    const { data, error } = await supabase
      .from('students')
      .delete()
      .eq('owner_id', ownerId)
      .in('id', batch)
      .select('id');
    if (error) {
      error.jumlahTertulis = deleted;
      throw error;
    }
    deleted += data?.length || 0;
  }
  return deleted;
}
