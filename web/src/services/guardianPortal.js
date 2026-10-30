import { supabase } from '../lib/supabase.ts';

const RELASI = new Set(['ibu', 'ayah', 'wali']);

async function barisRpc(nama, argumen) {
    const { data, error } = await supabase.rpc(nama, argumen);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error(`Respons ${nama} tidak valid.`);
    return data;
}

function wajibId(nilai, label) {
    if (typeof nilai !== 'string' || !nilai.trim()) throw new TypeError(`${label} wajib diisi.`);
    return nilai.trim();
}

export async function muatAkunWaliTenant() {
    const rows = await barisRpc('admin_guardian_accounts');
    if (rows.some((row) => !row || typeof row.user_id !== 'string'
        || typeof row.nama !== 'string' || typeof row.email !== 'string')) {
        throw new Error('Daftar akun orang tua tidak valid.');
    }
    return rows;
}

export async function muatSiswaTenantUntukWali() {
    const rows = await barisRpc('admin_guardian_students');
    if (rows.some((row) => !row || typeof row.student_id !== 'string'
        || typeof row.nama !== 'string' || typeof row.kelas !== 'string')) {
        throw new Error('Daftar siswa tenant tidak valid.');
    }
    return rows;
}

export async function muatTautanWaliTenant() {
    const rows = await barisRpc('admin_student_guardian_links');
    if (rows.some((row) => !row || typeof row.student_id !== 'string'
        || typeof row.guardian_user_id !== 'string' || typeof row.student_nama !== 'string'
        || typeof row.guardian_nama !== 'string' || !RELASI.has(row.relationship))) {
        throw new Error('Daftar tautan orang tua tidak valid.');
    }
    return rows;
}

export async function tautkanWali(studentId, guardianUserId, relationship) {
    wajibId(studentId, 'Siswa');
    wajibId(guardianUserId, 'Akun orang tua');
    if (!RELASI.has(relationship)) throw new TypeError('Hubungan keluarga tidak valid.');
    const { error } = await supabase.rpc('link_student_guardian', {
        p_student_id: studentId,
        p_guardian_user_id: guardianUserId,
        p_relationship: relationship,
    });
    if (error) throw error;
}

export async function lepasTautanWali(studentId, guardianUserId) {
    wajibId(studentId, 'Siswa');
    wajibId(guardianUserId, 'Akun orang tua');
    const { error } = await supabase.rpc('unlink_student_guardian', {
        p_student_id: studentId,
        p_guardian_user_id: guardianUserId,
    });
    if (error) throw error;
}

export async function muatAnakTertaut() {
    const rows = await barisRpc('parent_linked_students');
    if (rows.some((row) => !row || typeof row.student_id !== 'string'
        || typeof row.nama !== 'string' || typeof row.kelas !== 'string'
        || !RELASI.has(row.relationship))) {
        throw new Error('Daftar anak tertaut tidak valid.');
    }
    return rows;
}

export async function muatPresensiAnak(studentId) {
    const rows = await barisRpc('parent_student_attendance', { p_student_id: wajibId(studentId, 'Siswa') });
    if (rows.some((row) => !row || typeof row.tanggal !== 'string'
        || row.status !== 'hadir' || typeof row.waktu !== 'string')) {
        throw new Error('Riwayat presensi siswa tidak valid.');
    }
    return rows;
}

export async function muatNilaiAnak(studentId) {
    const rows = await barisRpc('parent_student_exam_results', { p_student_id: wajibId(studentId, 'Siswa') });
    if (rows.some((row) => !row || typeof row.exam_id !== 'string'
        || typeof row.title !== 'string' || typeof row.kelas !== 'string'
        || typeof row.submitted_at !== 'string'
        || (row.score !== null && !Number.isFinite(Number(row.score)))
        || typeof row.grade_pending !== 'boolean')) {
        throw new Error('Daftar nilai anak tidak valid.');
    }
    return rows;
}