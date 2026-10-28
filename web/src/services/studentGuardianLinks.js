import { supabase } from '../lib/supabase.ts';

function assertTenantId(tenantId) {
  if (typeof tenantId !== 'string' || !tenantId.trim()) {
    throw new Error('Sesi admin sekolah tidak memiliki tenant aktif.');
  }
}

function throwOnError(result, label) {
  if (result.error) {
    console.error(`[student-guardian-links] ${label}:`, result.error);
    throw result.error;
  }
  return result.data || [];
}

export async function muatKandidatWaliSiswa(tenantId) {
  assertTenantId(tenantId);
  const [studentsResult, guardiansResult, linksResult, auditResult] = await Promise.all([
    supabase.from('students')
      .select('id,nama,kelas,tenant_id')
      .eq('tenant_id', tenantId)
      .order('kelas')
      .order('nama'),
    supabase.from('profiles')
      .select('id,nama,email,role,roles,tenant_id,active')
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .or('role.in.(ortu,orang_tua),roles.ov.{ortu,orang_tua}')
      .order('nama'),
    supabase.from('student_guardian_links')
      .select('id,student_id,guardian_user_id,status,created_at,verified_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false }),
    supabase.from('student_guardian_link_audit')
      .select('id,student_id,guardian_user_id,actor_id,action,previous_status,new_status,created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);
  const students = throwOnError(studentsResult, 'Gagal memuat roster siswa');
  const guardians = throwOnError(guardiansResult, 'Gagal memuat kandidat akun wali');
  const links = throwOnError(linksResult, 'Gagal memuat status penautan wali');
  const audit = throwOnError(auditResult, 'Gagal memuat audit penautan wali');

  const studentsById = new Map(students.map((student) => [student.id, student]));
  const guardiansById = new Map(guardians.map((guardian) => [guardian.id, guardian]));
  const actorIds = [...new Set(audit.map((entry) => entry.actor_id).filter(Boolean))];
  let actorsById = new Map();
  if (actorIds.length) {
    const actorsResult = await supabase.from('profiles')
      .select('id,nama')
      .eq('tenant_id', tenantId)
      .in('id', actorIds);
    actorsById = new Map(
      throwOnError(actorsResult, 'Gagal memuat identitas admin pada audit')
        .map((actor) => [actor.id, actor]),
    );
  }

  return {
    students,
    guardians,
    links: links.map((link) => ({
      ...link,
      student: studentsById.get(link.student_id) || null,
      guardian: guardiansById.get(link.guardian_user_id) || null,
    })),
    audit: audit.map((entry) => ({
      ...entry,
      student: studentsById.get(entry.student_id) || null,
      guardian: guardiansById.get(entry.guardian_user_id) || null,
      actor: actorsById.get(entry.actor_id) || null,
    })),
  };
}

export async function ubahStatusWaliSiswa(studentId, guardianUserId, action) {
  if (!studentId || !guardianUserId ||
    !['request', 'verify', 'reject', 'revoke'].includes(action)) {
    throw new TypeError('Data penautan wali-siswa tidak valid.');
  }
  const { error } = await supabase.rpc('manage_student_guardian_link', {
    p_student_id: studentId,
    p_guardian_user_id: guardianUserId,
    p_action: action,
  });
  if (error) {
    console.error('[student-guardian-links] Gagal mengubah status penautan:', error);
    throw error;
  }
}
