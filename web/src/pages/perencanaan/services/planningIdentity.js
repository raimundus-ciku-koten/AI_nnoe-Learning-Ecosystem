import { supabase } from '../../../lib/supabase.ts';
import { muatPengaturanTenant } from '../../../services/tenantSettings.js';
import { buatTautanKopSuratTenant } from '../../../services/tenantLetterhead.js';

const ROLE_GURU = new Set(['guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler']);

export async function muatIdentitasDokumen({ ownerUid, tenantId }) {
    if (typeof ownerUid !== 'string' || !ownerUid.trim() ||
        typeof tenantId !== 'string' || !tenantId.trim()) {
        throw new TypeError('Pemilik paket dan tenant wajib tersedia untuk memuat identitas dokumen.');
    }

    const [profileResult, tenant] = await Promise.all([
        supabase.from('profiles')
            .select('id,tenant_id,nama,nip,role,active')
            .eq('id', ownerUid)
            .eq('tenant_id', tenantId)
            .maybeSingle(),
        muatPengaturanTenant(tenantId),
    ]);
    if (profileResult.error) throw profileResult.error;

    const profile = profileResult.data;
    if (!profile || profile.active !== true || !ROLE_GURU.has(profile.role) ||
        profile.tenant_id !== tenantId) {
        throw new Error('Profil guru aktif pada tenant ini tidak ditemukan. Identitas dokumen tidak dapat diverifikasi.');
    }
    if (!tenant?.nama) {
        throw new Error('Nama sekolah resmi belum tersedia pada pengaturan tenant.');
    }
    let kopSuratUrl = '';
    if (tenant.kopSuratTersedia && tenant.kopSuratPath) {
        try {
            kopSuratUrl = await buatTautanKopSuratTenant(tenantId, tenant.kopSuratPath);
        } catch (error) {
            console.warn('[perencanaan] Kop sekolah tidak dapat dimuat:', error?.message || error);
        }
    }

    return {
        tahunAjaran: tenant.tahunAjaran || '',
        identitas: {
            sekolah: tenant.nama,
            npsn: tenant.npsn || '',
            alamat: tenant.alamat || '',
            kopSuratUrl,
            guru: profile.nama || '',
            nipGuru: profile.nip || '',
            kepsek: tenant.kepalaSekolah || '',
            nipKepsek: tenant.nipKepalaSekolah || '',
            lokasi: '',
        },
    };
}