import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    profile: {
        id: 'teacher-1',
        tenant_id: 'school-1',
        nama: 'Guru Resmi',
        nip: '198001012010011001',
        role: 'guru',
        active: true,
    },
    profileError: null,
    tenant: {
        tenantId: 'school-1',
        nama: 'SMA Contoh',
        npsn: '12345678',
        kepalaSekolah: 'Kepala Resmi',
        nipKepalaSekolah: '197001012000011001',
        tahunAjaran: '2026/2027',
        semester: 'Ganjil',
    },
    from: vi.fn(),
    loadTenant: vi.fn(),
    letterheadUrl: vi.fn(),
}));

vi.mock('../../../lib/supabase.ts', () => {
    const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({ data: mocks.profile, error: mocks.profileError })),
    };
    return { supabase: { from: mocks.from.mockReturnValue(query) } };
});

vi.mock('../../../services/tenantSettings.js', () => ({
    muatPengaturanTenant: mocks.loadTenant,
}));
vi.mock('../../../services/tenantLetterhead.js', () => ({
    buatTautanKopSuratTenant: mocks.letterheadUrl,
}));

import { muatIdentitasDokumen } from './planningIdentity.js';

describe('identitas resmi dokumen perencanaan', () => {
    beforeEach(() => {
        mocks.profile = {
            id: 'teacher-1', tenant_id: 'school-1', nama: 'Guru Resmi',
            nip: '198001012010011001', role: 'guru', active: true,
        };
        mocks.profileError = null;
        mocks.tenant = {
            tenantId: 'school-1', nama: 'SMA Contoh', npsn: '12345678',
            kepalaSekolah: 'Kepala Resmi', nipKepalaSekolah: '197001012000011001',
            tahunAjaran: '2026/2027', semester: 'Ganjil',
        };
        mocks.from.mockClear();
        mocks.loadTenant.mockResolvedValue(mocks.tenant);
        mocks.letterheadUrl.mockResolvedValue('');
    });

    it('mengambil nama/NIP guru dan identitas sekolah dari sumber tenant terotorisasi', async () => {
        await expect(muatIdentitasDokumen({ ownerUid: 'teacher-1', tenantId: 'school-1' }))
            .resolves.toEqual({
                tahunAjaran: '2026/2027',
                identitas: {
                    sekolah: 'SMA Contoh',
                    npsn: '12345678',
                    alamat: '',
                    kopSuratUrl: '',
                    guru: 'Guru Resmi',
                    nipGuru: '198001012010011001',
                    kepsek: 'Kepala Resmi',
                    nipKepsek: '197001012000011001',
                    lokasi: '',
                },
            });
        expect(mocks.from).toHaveBeenCalledWith('profiles');
        expect(mocks.loadTenant).toHaveBeenCalledWith('school-1');
    });

    it('membuat URL bertanda tangan hanya untuk kop yang tercatat pada tenant', async () => {
        mocks.tenant.kopSuratTersedia = true;
        mocks.tenant.kopSuratPath = 'school-1/letterhead';
        mocks.tenant.alamat = 'Jalan Contoh 1';
        mocks.letterheadUrl.mockResolvedValue('https://storage.example/kop-signed');

        const result = await muatIdentitasDokumen({ ownerUid: 'teacher-1', tenantId: 'school-1' });

        expect(result.identitas.alamat).toBe('Jalan Contoh 1');
        expect(result.identitas.kopSuratUrl).toBe('https://storage.example/kop-signed');
        expect(mocks.letterheadUrl).toHaveBeenCalledWith('school-1', 'school-1/letterhead');
    });

    it('menolak profil lintas tenant atau bukan guru aktif', async () => {
        mocks.profile.tenant_id = 'school-2';
        await expect(muatIdentitasDokumen({ ownerUid: 'teacher-1', tenantId: 'school-1' }))
            .rejects.toThrow('Profil guru aktif');

        mocks.profile.tenant_id = 'school-1';
        mocks.profile.role = 'siswa';
        await expect(muatIdentitasDokumen({ ownerUid: 'teacher-1', tenantId: 'school-1' }))
            .rejects.toThrow('Profil guru aktif');
    });

    it('menolak konteks tenant/pemilik kosong atau sekolah tanpa nama resmi', async () => {
        await expect(muatIdentitasDokumen({ ownerUid: '', tenantId: 'school-1' }))
            .rejects.toThrow('wajib tersedia');
        mocks.tenant.nama = '';
        await expect(muatIdentitasDokumen({ ownerUid: 'teacher-1', tenantId: 'school-1' }))
            .rejects.toThrow('Nama sekolah resmi');
    });
});