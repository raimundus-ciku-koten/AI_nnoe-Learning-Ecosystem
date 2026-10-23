import { supabase } from '../lib/supabase.ts';

function requiredText(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${label} tidak valid.`);
  }
  return value.trim();
}

async function readRows(functionName, label) {
  const { data, error } = await supabase.rpc(functionName);
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error(`${label} tidak valid.`);
  return data;
}

export async function muatAkunWaliSekolah() {
  return readRows('guardian_accounts', 'Daftar akun wali');
}

export async function muatRosterWaliSekolah() {
  return readRows('guardian_student_roster', 'Daftar roster siswa');
}

export async function muatTautanWaliSekolah() {
  return readRows('linked_guardian_student_accounts', 'Daftar tautan wali');
}

export async function tautkanWaliKeSiswa(guardianUserId, studentId, relationshipVerified) {
  requiredText(guardianUserId, 'Akun wali');
  requiredText(studentId, 'Siswa');
  if (relationshipVerified !== true) {
    throw new TypeError('Verifikasi hubungan wali oleh sekolah wajib dikonfirmasi.');
  }

  const { error } = await supabase.rpc('link_guardian_to_student', {
    p_guardian_user_id: guardianUserId,
    p_student_id: studentId,
    p_relationship_verified: true,
  });
  if (error) throw error;
}

export async function lepasWaliDariSiswa(guardianUserId, studentId) {
  requiredText(guardianUserId, 'Akun wali');
  requiredText(studentId, 'Siswa');
  const { error } = await supabase.rpc('unlink_guardian_from_student', {
    p_guardian_user_id: guardianUserId,
    p_student_id: studentId,
  });
  if (error) throw error;
}

export async function muatRingkasanAnakWali() {
  return readRows('parent_children_overview', 'Ringkasan anak');
}
