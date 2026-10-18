import { supabase } from '../lib/supabase.ts';

const FORMAT_KODE = /^ALE-[A-Z0-9]{1,6}-[A-Z0-9]{6}-[0-9]{4}$/;
const ZONA_WAKTU = 'Asia/Makassar';

export function tanggalHariIni(tanggal = new Date(), zona = ZONA_WAKTU) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(tanggal);
}

export async function tungguPengguna(cadangan = null) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const user = data.session?.user;
  return user ? { ...user, uid: user.id } : cadangan;
}

export async function cariSiswaByKode(uid, kode) {
  if (!uid || !FORMAT_KODE.test(String(kode || '').trim())) return null;
  const { data, error } = await supabase
    .from('students')
    .select('id,owner_id,tenant_id,nama,kelas,nisn,kode_unik')
    .eq('owner_id', uid)
    .eq('kode_unik', String(kode).trim())
    .limit(2);
  if (error) throw error;
  if (!data?.length) return null;
  if (data.length > 1) {
    const duplicateError = new Error('Kode dipakai lebih dari satu siswa. Hubungi admin.');
    duplicateError.code = 'student/duplicate-code';
    throw duplicateError;
  }
  const student = data[0];
  return {
    id: student.id,
    ownerId: student.owner_id,
    tenantId: student.tenant_id,
    nama: student.nama,
    kelas: student.kelas,
    nisn: student.nisn || '',
    kodeUnik: student.kode_unik,
  };
}

async function ambilCatatanAda(uid, siswaId, tanggal) {
  return supabase
    .from('attendance_records')
    .select('id,waktu')
    .eq('owner_id', uid)
    .eq('student_id', siswaId)
    .eq('tanggal', tanggal)
    .maybeSingle();
}

export async function catatKehadiran(uid, siswa, kode) {
  if (!uid || siswa?.ownerId !== uid || !siswa?.id || !siswa?.tenantId ||
      siswa?.kodeUnik !== kode || !FORMAT_KODE.test(String(kode || ''))) {
    throw new Error('Data siswa tidak valid untuk pencatatan presensi.');
  }

  const tanggal = tanggalHariIni();
  const { data: existing, error: lookupError } = await ambilCatatanAda(uid, siswa.id, tanggal);
  if (lookupError) throw lookupError;
  if (existing) return { status: 'sudah', waktu: existing.waktu ? new Date(existing.waktu) : null };

  const { data, error } = await supabase
    .from('attendance_records')
    .insert({
      tenant_id: siswa.tenantId,
      owner_id: uid,
      student_id: siswa.id,
      tanggal,
      status: 'hadir',
      metode: 'scan',
      kode_unik: kode,
      nama: siswa.nama,
      kelas: siswa.kelas,
    })
    .select('id,waktu')
    .single();
  if (!error) return { status: 'dicatat', waktu: data?.waktu ? new Date(data.waktu) : null };
  if (error.code !== '23505') throw error;

  const { data: duplicate, error: duplicateError } = await ambilCatatanAda(uid, siswa.id, tanggal);
  if (duplicateError) throw duplicateError;
  if (!duplicate) throw error;
  return { status: 'sudah', waktu: duplicate.waktu ? new Date(duplicate.waktu) : null };
}
