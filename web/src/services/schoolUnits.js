import { supabase } from '../lib/supabase.ts';

export const JENJANG_UNIT = Object.freeze([
    { value: 'paud', label: 'PAUD' },
    { value: 'sd', label: 'SD' },
    { value: 'smp', label: 'SMP' },
    { value: 'sma', label: 'SMA' },
    { value: 'smk', label: 'SMK' },
    { value: 'ma', label: 'MA' },
    { value: 'mak', label: 'MAK' },
    { value: 'slb', label: 'SLB' },
    { value: 'lainnya', label: 'Lainnya' },
]);

const COLUMNS = 'id,tenant_id,code,name,education_level,active,created_by,updated_by,created_at,updated_at';
const LEVELS = new Set(JENJANG_UNIT.map((level) => level.value));

function requireTenant(tenantId) {
    if (typeof tenantId !== 'string' || !tenantId.trim()) {
        throw new TypeError('Tenant sekolah belum tersedia.');
    }
}

function requireContext(tenantId, actorId) {
    requireTenant(tenantId);
    if (typeof actorId !== 'string' || !actorId.trim()) {
        throw new TypeError('Identitas admin belum tersedia.');
    }
}

function normalizeUnit(input) {
    const code = String(input.code ?? '').trim().toUpperCase();
    const name = String(input.name ?? '').trim();
    const educationLevel = String(input.educationLevel ?? '').trim().toLowerCase();
    if (!/^[A-Z0-9][A-Z0-9_-]{0,29}$/.test(code)) {
        throw new TypeError('Kode unit harus 1–30 karakter: huruf, angka, garis bawah, atau tanda hubung.');
    }
    if (!name || name.length > 120) throw new TypeError('Nama unit wajib diisi dan maksimal 120 karakter.');
    if (!LEVELS.has(educationLevel)) throw new TypeError('Jenjang pendidikan tidak valid.');
    return { code, name, education_level: educationLevel, active: input.active !== false };
}

export async function muatUnitSekolah(tenantId) {
    requireTenant(tenantId);
    const { data, error } = await supabase
        .from('school_units')
        .select(COLUMNS)
        .eq('tenant_id', tenantId)
        .order('active', { ascending: false })
        .order('name', { ascending: true });
    if (error) throw error;
    return data || [];
}

export async function buatUnitSekolah({ tenantId, actorId, unit }) {
    requireContext(tenantId, actorId);
    const values = normalizeUnit(unit);
    const { data, error } = await supabase
        .from('school_units')
        .insert({
            tenant_id: tenantId,
            ...values,
            created_by: actorId,
            updated_by: actorId,
        })
        .select(COLUMNS)
        .single();
    if (error) throw error;
    return data;
}

export async function ubahUnitSekolah({ tenantId, actorId, unitId, unit }) {
    requireContext(tenantId, actorId);
    if (typeof unitId !== 'string' || !unitId.trim()) throw new TypeError('ID unit tidak valid.');
    const { data, error } = await supabase
        .from('school_units')
        .update({ ...normalizeUnit(unit), updated_by: actorId })
        .eq('tenant_id', tenantId)
        .eq('id', unitId)
        .select(COLUMNS)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Unit tidak ditemukan atau Anda tidak memiliki izin mengubahnya.');
    return data;
}