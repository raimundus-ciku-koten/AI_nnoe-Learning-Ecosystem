import { supabase } from '../lib/supabase.ts';

const COLUMNS = 'id,tenant_id,owner_id,tanggal,kelas,mapel,jam,materi,kegiatan,kendala,tindak_lanjut,status,created_at,updated_at';
const ROLE_GURU = new Set(['guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler']);
const RE_JAM = /^[0-9A-Za-z-]{1,20}$/;
const BATAS = Object.freeze({
  kelas: 120,
  mapel: 120,
  materi: 2000,
  kegiatan: 4000,
  kendala: 2000,
  tindakLanjut: 2000,
});

function teks(input, field) {
  const value = input[field];
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new TypeError(`Isian ${field} harus berupa teks.`);
  return value.trim();
}

function validasiKepemilikan(tenantId, ownerUid) {
  if (typeof tenantId !== 'string' || !tenantId.trim()) {
    throw new Error('Akun ini belum terhubung dengan tenant sekolah.');
  }
  if (typeof ownerUid !== 'string' || !ownerUid.trim()) {
    throw new Error('Sesi pengguna tidak tersedia.');
  }
}

function validasiTanggal(tanggal) {
  if (typeof tanggal !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return false;
  if (Number(tanggal.slice(0, 4)) < 1) return false;
  const parsed = new Date(`${tanggal}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === tanggal;
}

export function bersihkanJurnal(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Data jurnal tidak valid.');
  }
  const value = {
    tanggal: teks(input, 'tanggal'),
    kelas: teks(input, 'kelas'),
    mapel: teks(input, 'mapel'),
    jam: teks(input, 'jam'),
    materi: teks(input, 'materi'),
    kegiatan: teks(input, 'kegiatan'),
    kendala: teks(input, 'kendala'),
    tindakLanjut: teks(input, 'tindakLanjut'),
    status: input.status === 'final' ? 'final' : input.status === 'draft' ? 'draft' : '',
  };
  if (!validasiTanggal(value.tanggal)) throw new TypeError('Tanggal jurnal tidak valid.');
  if (!value.kelas || value.kelas.length > BATAS.kelas) throw new TypeError('Pilih kelas yang valid.');
  if (!RE_JAM.test(value.jam)) throw new TypeError('Jam ke- hanya boleh huruf, angka, atau tanda hubung (misalnya 1-2).');
  if (!value.materi) throw new TypeError('Materi pokok wajib diisi.');
  if (!value.status) throw new TypeError('Status jurnal tidak valid.');
  for (const [field, max] of Object.entries(BATAS)) {
    if (value[field].length > max) {
      const label = field === 'tindakLanjut' ? 'Tindak lanjut' : field;
      throw new RangeError(`${label} terlalu panjang (maksimal ${max} karakter).`);
    }
  }
  return value;
}

function dariBaris(row) {
  if (!row || typeof row.id !== 'string' ||
      typeof row.tenant_id !== 'string' ||
      typeof row.owner_id !== 'string' ||
      !validasiTanggal(row.tanggal) ||
      typeof row.kelas !== 'string' ||
      typeof row.mapel !== 'string' ||
      typeof row.jam !== 'string' ||
      typeof row.materi !== 'string' ||
      typeof row.kegiatan !== 'string' ||
      typeof row.kendala !== 'string' ||
      typeof row.tindak_lanjut !== 'string' ||
      !['draft', 'final'].includes(row.status) ||
      typeof row.created_at !== 'string' ||
      typeof row.updated_at !== 'string') {
    throw new Error('Supabase mengembalikan catatan jurnal dengan format yang tidak valid.');
  }
  const journal = {
    id: row.id,
    tenantId: row.tenant_id,
    ownerUid: row.owner_id,
    tanggal: row.tanggal,
    kelas: row.kelas,
    mapel: row.mapel,
    jam: row.jam,
    materi: row.materi,
    kegiatan: row.kegiatan,
    kendala: row.kendala,
    tindakLanjut: row.tindak_lanjut,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (!Number.isFinite(Date.parse(journal.createdAt)) ||
      !Number.isFinite(Date.parse(journal.updatedAt)) ||
      Date.parse(journal.createdAt) > Date.parse(journal.updatedAt)) {
    throw new Error('Supabase mengembalikan waktu jurnal yang tidak valid.');
  }
  return journal;
}

export function rentangBulanJurnal(month) {
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new TypeError('Pilih bulan riwayat yang valid.');
  }
  const [year, value] = month.split('-').map(Number);
  if (year < 1) throw new TypeError('Pilih bulan riwayat yang valid.');
  const nextMonth = value === 12 ? `${year + 1}-01` : `${year}-${String(value + 1).padStart(2, '0')}`;
  return { dari: `${month}-01`, sampai: `${nextMonth}-01` };
}

export async function muatJurnal(tenantId, ownerUid, { month, kelas = '' }) {
  validasiKepemilikan(tenantId, ownerUid);
  const { dari, sampai } = rentangBulanJurnal(month);
  let query = supabase
    .from('lesson_journals')
    .select(COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('owner_id', ownerUid)
    .gte('tanggal', dari)
    .lt('tanggal', sampai);
  if (kelas) query = query.eq('kelas', kelas);
  const { data, error } = await query
    .order('tanggal', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Supabase tidak mengembalikan riwayat jurnal yang valid.');
  return data.map(dariBaris);
}

export async function tambahJurnal(tenantId, ownerUid, input) {
  validasiKepemilikan(tenantId, ownerUid);
  const journal = bersihkanJurnal(input);
  const { data, error } = await supabase
    .from('lesson_journals')
    .insert({
      tenant_id: tenantId,
      owner_id: ownerUid,
      tanggal: journal.tanggal,
      kelas: journal.kelas,
      mapel: journal.mapel,
      jam: journal.jam,
      materi: journal.materi,
      kegiatan: journal.kegiatan,
      kendala: journal.kendala,
      tindak_lanjut: journal.tindakLanjut,
      status: journal.status,
    })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return dariBaris(data);
}

export async function ubahJurnal(tenantId, ownerUid, journalId, input) {
  validasiKepemilikan(tenantId, ownerUid);
  if (typeof journalId !== 'string' || !journalId.trim()) throw new TypeError('ID jurnal tidak valid.');
  const journal = bersihkanJurnal(input);
  const { data, error } = await supabase
    .from('lesson_journals')
    .update({
      tanggal: journal.tanggal,
      kelas: journal.kelas,
      mapel: journal.mapel,
      jam: journal.jam,
      materi: journal.materi,
      kegiatan: journal.kegiatan,
      kendala: journal.kendala,
      tindak_lanjut: journal.tindakLanjut,
      status: journal.status,
    })
    .eq('tenant_id', tenantId)
    .eq('owner_id', ownerUid)
    .eq('id', journalId)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Jurnal tidak ditemukan atau aksesnya telah berubah.');
  return dariBaris(data);
}

export async function hapusJurnal(tenantId, ownerUid, journalId) {
  validasiKepemilikan(tenantId, ownerUid);
  if (typeof journalId !== 'string' || !journalId.trim()) throw new TypeError('ID jurnal tidak valid.');
  const { data, error } = await supabase
    .from('lesson_journals')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('owner_id', ownerUid)
    .eq('id', journalId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Jurnal tidak ditemukan atau aksesnya telah berubah.');
}

export function dapatMengelolaJurnal(role) {
  return ROLE_GURU.has(String(role || '').trim().toLowerCase());
}
