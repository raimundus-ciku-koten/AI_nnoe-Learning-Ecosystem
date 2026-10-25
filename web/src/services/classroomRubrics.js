import { supabase } from '../lib/supabase.ts';

const LEVEL_KEYS = ['1', '2', '3', '4'];
const MAX_RUBRICS = 100;

function wajibTeks(value, label, maxLength) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new TypeError(`${label} wajib diisi dan maksimal ${maxLength} karakter.`);
  }
  return value.trim();
}

function validasiKriteria(criteria) {
  if (!Array.isArray(criteria) || criteria.length < 1 || criteria.length > 12) {
    throw new TypeError('Rubrik harus memiliki 1–12 kriteria.');
  }
  const names = new Set();
  return criteria.map((criterion, index) => {
    if (!criterion || typeof criterion !== 'object' || Array.isArray(criterion)) {
      throw new TypeError(`Kriteria nomor ${index + 1} tidak valid.`);
    }
    const name = wajibTeks(criterion.name, `Nama kriteria nomor ${index + 1}`, 120);
    const normalizedName = name.toLocaleLowerCase('id');
    if (names.has(normalizedName)) {
      throw new TypeError('Nama setiap kriteria harus berbeda.');
    }
    names.add(normalizedName);
    if (!criterion.levels || typeof criterion.levels !== 'object' ||
        Array.isArray(criterion.levels)) {
      throw new TypeError(`Deskripsi level kriteria nomor ${index + 1} tidak valid.`);
    }
    const levels = {};
    for (const key of LEVEL_KEYS) {
      levels[key] = wajibTeks(
        criterion.levels[key],
        `Deskripsi level ${key} kriteria nomor ${index + 1}`,
        500,
      );
    }
    return { name, levels };
  });
}

function dariBarisVersi(row) {
  if (!row || typeof row.id !== 'string' ||
      !Number.isInteger(row.version) || row.version < 1 ||
      typeof row.summary !== 'string' ||
      typeof row.created_at !== 'string' ||
      typeof row.created_by !== 'string') {
    throw new Error('Riwayat versi rubrik dari server tidak valid.');
  }
  return {
    id: row.id,
    versi: row.version,
    ringkasan: row.summary,
    kriteria: validasiKriteria(row.criteria),
    dibuatPada: row.created_at,
    dibuatOleh: row.created_by,
  };
}

function dariBarisRubrik(row) {
  if (!row || typeof row.id !== 'string' ||
      typeof row.tenant_id !== 'string' ||
      typeof row.classroom_id !== 'string' ||
      typeof row.owner_id !== 'string' ||
      typeof row.title !== 'string' ||
      typeof row.created_at !== 'string' ||
      !Array.isArray(row.classroom_rubric_versions)) {
    throw new Error('Data rubrik dari server tidak valid.');
  }
  return {
    id: row.id,
    tenantId: row.tenant_id,
    classroomId: row.classroom_id,
    pemilikId: row.owner_id,
    judul: row.title,
    dibuatPada: row.created_at,
    versi: row.classroom_rubric_versions
      .map(dariBarisVersi)
      .sort((a, b) => b.versi - a.versi),
  };
}

function validasiIdentitas(tenantId, userId) {
  wajibTeks(tenantId, 'Tenant sekolah', 200);
  wajibTeks(userId, 'Akun guru', 200);
}

function validasiInputRubrik({ classroomId, title, summary, criteria }) {
  if (typeof summary !== 'string' || summary.length > 2000) {
    throw new TypeError('Ringkasan rubrik maksimal 2.000 karakter.');
  }
  return {
    classroomId: wajibTeks(classroomId, 'Kelas', 200),
    title: wajibTeks(title, 'Judul rubrik', 160),
    summary: summary.trim(),
    criteria: validasiKriteria(criteria),
  };
}

export async function muatRubrikKelas(tenantId, userId) {
  validasiIdentitas(tenantId, userId);
  const { data, error } = await supabase
    .from('classroom_rubrics')
    .select('id,tenant_id,classroom_id,owner_id,title,created_at,classroom_rubric_versions(id,version,summary,criteria,created_at,created_by)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .order('version', {
      referencedTable: 'classroom_rubric_versions',
      ascending: false,
    })
    .limit(MAX_RUBRICS)
    .limit(20, { referencedTable: 'classroom_rubric_versions' });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Daftar rubrik kelas tidak valid.');
  return data.map(dariBarisRubrik);
}

export async function buatRubrikKelas(tenantId, userId, input) {
  validasiIdentitas(tenantId, userId);
  const rubric = validasiInputRubrik(input);
  const { data, error } = await supabase.rpc('create_classroom_rubric', {
    p_classroom_id: rubric.classroomId,
    p_title: rubric.title,
    p_summary: rubric.summary,
    p_criteria: rubric.criteria,
  });
  if (error) throw error;
  if (typeof data !== 'string' || !data.trim()) {
    throw new Error('Server tidak mengembalikan identitas rubrik yang valid.');
  }
  return data;
}

export async function buatVersiRubrikKelas(tenantId, userId, rubricId, input) {
  validasiIdentitas(tenantId, userId);
  const rubric = validasiInputRubrik(input);
  wajibTeks(rubricId, 'ID rubrik', 200);
  const { data, error } = await supabase.rpc('create_classroom_rubric_version', {
    p_rubric_id: rubricId,
    p_title: rubric.title,
    p_summary: rubric.summary,
    p_criteria: rubric.criteria,
  });
  if (error) throw error;
  if (!Number.isInteger(data) || data < 2) {
    throw new Error('Server tidak mengembalikan nomor versi rubrik yang valid.');
  }
  return data;
}

export { validasiKriteria };
