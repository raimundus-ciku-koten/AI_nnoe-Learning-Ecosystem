import { supabase } from '../lib/supabase.ts';

const COLUMNS = 'id,tenant_id,author_id,title,body,created_at';
const MAX_ANNOUNCEMENTS = 100;

function teksWajib(value, label, max) {
    if (typeof value !== 'string') throw new TypeError(`${label} tidak valid.`);
    const cleaned = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
    if (!cleaned || cleaned.length > max) {
        throw new TypeError(`${label} wajib diisi dan maksimal ${max} karakter.`);
    }
    return cleaned;
}

function konteksWajib(tenantId, userId) {
    if (typeof tenantId !== 'string' || !tenantId.trim()) {
        throw new TypeError('Tenant sekolah belum tersedia.');
    }
    if (userId !== undefined && (typeof userId !== 'string' || !userId.trim())) {
        throw new TypeError('Identitas pengguna belum tersedia.');
    }
}

export async function muatPengumumanSekolah(tenantId) {
    konteksWajib(tenantId);
    const { data, error } = await supabase
        .from('school_announcements')
        .select(COLUMNS)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(MAX_ANNOUNCEMENTS);
    if (error) throw error;
    return data || [];
}

export async function buatPengumumanSekolah({ tenantId, authorId, title, body }) {
    konteksWajib(tenantId, authorId);
    const row = {
        tenant_id: tenantId,
        author_id: authorId,
        title: teksWajib(title, 'Judul', 200),
        body: teksWajib(body, 'Isi pengumuman', 5000),
    };
    const { data, error } = await supabase
        .from('school_announcements')
        .insert(row)
        .select(COLUMNS)
        .single();
    if (error) throw error;
    return data;
}

export async function ubahPengumumanSekolah({ tenantId, announcementId, title, body }) {
    konteksWajib(tenantId);
    if (typeof announcementId !== 'string' || !announcementId.trim()) {
        throw new TypeError('ID pengumuman tidak valid.');
    }
    const { data, error } = await supabase
        .from('school_announcements')
        .update({
            title: teksWajib(title, 'Judul', 200),
            body: teksWajib(body, 'Isi pengumuman', 5000),
        })
        .eq('tenant_id', tenantId)
        .eq('id', announcementId)
        .select(COLUMNS)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Pengumuman tidak ditemukan atau Anda tidak memiliki izin mengubahnya.');
    return data;
}

export async function hapusPengumumanSekolah({ tenantId, announcementId }) {
    konteksWajib(tenantId);
    if (typeof announcementId !== 'string' || !announcementId.trim()) {
        throw new TypeError('ID pengumuman tidak valid.');
    }
    const { data, error } = await supabase
        .from('school_announcements')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('id', announcementId)
        .select('id')
        .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Pengumuman tidak ditemukan atau Anda tidak memiliki izin menghapusnya.');
}