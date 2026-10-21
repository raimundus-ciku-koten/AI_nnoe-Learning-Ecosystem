import { supabase } from '../lib/supabase.ts';

const COLUMNS = 'id,tenant_id,owner_id,mapel,kelas,jenis,pertanyaan,pilihan,jawaban,pembahasan,created_at,updated_at';

function validasiKepemilikan(tenantId, ownerUid) {
  if (typeof tenantId !== 'string' || !tenantId.trim()) {
    throw new Error('Akun ini belum terhubung dengan tenant sekolah.');
  }
  if (typeof ownerUid !== 'string' || !ownerUid.trim()) {
    throw new Error('Sesi pengguna tidak tersedia.');
  }
}

function validasiSoal(soal) {
  const validText = (value, max, allowEmpty = false) =>
    typeof value === 'string' && value.length <= max && (allowEmpty || value.length > 0);
  if (!soal || typeof soal !== 'object' ||
      !validText(soal.mapel, 80) ||
      !validText(soal.kelas, 30) ||
      !['pilihan_ganda', 'uraian'].includes(soal.jenis) ||
      !validText(soal.pertanyaan, 2000) ||
      !Array.isArray(soal.pilihan) ||
      !validText(soal.jawaban, 1000) ||
      !validText(soal.pembahasan, 2000, true)) {
    throw new TypeError('Format soal tidak valid.');
  }
  if (soal.pilihan.some((choice) => !validText(choice, 300))) {
    throw new TypeError('Pilihan soal tidak valid.');
  }
  if (
    (soal.jenis === 'uraian' && soal.pilihan.length !== 0) ||
    (soal.jenis === 'pilihan_ganda' &&
      (soal.pilihan.length < 2 || soal.pilihan.length > 5 ||
        new Set(soal.pilihan).size !== soal.pilihan.length ||
        !soal.pilihan.includes(soal.jawaban)))
  ) {
    throw new TypeError('Pilihan dan jawaban soal tidak cocok.');
  }
}

function dariBaris(row) {
  if (!row || typeof row.id !== 'string' ||
      typeof row.tenant_id !== 'string' ||
      typeof row.owner_id !== 'string' ||
      typeof row.mapel !== 'string' ||
      typeof row.kelas !== 'string' ||
      !['pilihan_ganda', 'uraian'].includes(row.jenis) ||
      typeof row.pertanyaan !== 'string' ||
      !Array.isArray(row.pilihan) ||
      typeof row.jawaban !== 'string' ||
      typeof row.pembahasan !== 'string' ||
      typeof row.created_at !== 'string' ||
      typeof row.updated_at !== 'string') {
    throw new Error('Supabase mengembalikan baris bank soal yang tidak valid.');
  }
  const soal = {
    id: row.id,
    ownerUid: row.owner_id,
    mapel: row.mapel,
    kelas: row.kelas,
    jenis: row.jenis,
    pertanyaan: row.pertanyaan,
    pilihan: row.pilihan,
    jawaban: row.jawaban,
    pembahasan: row.pembahasan,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  validasiSoal(soal);
  if (
    !Number.isFinite(Date.parse(soal.createdAt)) ||
    !Number.isFinite(Date.parse(soal.updatedAt)) ||
    Date.parse(soal.createdAt) > Date.parse(soal.updatedAt)
  ) {
    throw new Error('Supabase mengembalikan waktu bank soal yang tidak valid.');
  }
  return soal;
}

export async function muatBankSoal(tenantId) {
  if (typeof tenantId !== 'string' || !tenantId.trim()) {
    throw new Error('Akun ini belum terhubung dengan tenant sekolah.');
  }
  const { data, error } = await supabase
    .from('question_bank')
    .select(COLUMNS)
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Supabase tidak mengembalikan daftar bank soal yang valid.');
  return data.map(dariBaris);
}

export async function tambahSoalBank(tenantId, ownerUid, soal) {
  validasiKepemilikan(tenantId, ownerUid);
  validasiSoal(soal);
  const { data, error } = await supabase
    .from('question_bank')
    .insert({
      tenant_id: tenantId,
      owner_id: ownerUid,
      mapel: soal.mapel,
      kelas: soal.kelas,
      jenis: soal.jenis,
      pertanyaan: soal.pertanyaan,
      pilihan: soal.pilihan,
      jawaban: soal.jawaban,
      pembahasan: soal.pembahasan,
    })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return dariBaris(data);
}

export async function ubahSoalBank(tenantId, ownerUid, questionId, soal) {
  validasiKepemilikan(tenantId, ownerUid);
  validasiSoal(soal);
  if (typeof questionId !== 'string' || !questionId.trim()) {
    throw new TypeError('ID soal tidak valid.');
  }
  const { data, error } = await supabase
    .from('question_bank')
    .update({
      mapel: soal.mapel,
      kelas: soal.kelas,
      jenis: soal.jenis,
      pertanyaan: soal.pertanyaan,
      pilihan: soal.pilihan,
      jawaban: soal.jawaban,
      pembahasan: soal.pembahasan,
    })
    .eq('tenant_id', tenantId)
    .eq('owner_id', ownerUid)
    .eq('id', questionId)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Soal tidak ditemukan atau aksesnya telah berubah.');
  return dariBaris(data);
}

export async function hapusSoalBank(tenantId, ownerUid, questionId) {
  validasiKepemilikan(tenantId, ownerUid);
  if (typeof questionId !== 'string' || !questionId.trim()) {
    throw new TypeError('ID soal tidak valid.');
  }
  const { data, error } = await supabase
    .from('question_bank')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('owner_id', ownerUid)
    .eq('id', questionId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Soal tidak ditemukan atau aksesnya telah berubah.');
}
