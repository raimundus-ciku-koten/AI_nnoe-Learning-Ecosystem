import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    storageFrom: vi.fn(),
    upload: vi.fn(),
    createSignedUrl: vi.fn(),
    remove: vi.fn(),
    loadTenant: vi.fn(),
    savePath: vi.fn(),
    bucket: {
        upload: vi.fn(),
        createSignedUrl: vi.fn(),
        remove: vi.fn(),
    },
}));

vi.mock('../lib/supabase.ts', () => ({
    supabase: { storage: { from: mocks.storageFrom } },
}));
vi.mock('./tenantSettings.js', () => ({
    muatPengaturanTenant: mocks.loadTenant,
    simpanKopSuratTenant: mocks.savePath,
}));

import {
    BATAS_KOP_SEKOLAH_BYTE,
    BUCKET_KOP_SEKOLAH,
    buatTautanKopSuratTenant,
    hapusKopSuratTenant,
    unggahKopSuratTenant,
} from './tenantLetterhead.js';

const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

function pngFile(bytes = PNG_SIGNATURE) {
    return new File([bytes], 'kop.png', { type: 'image/png' });
}

describe('kop sekolah tenant', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.storageFrom.mockReturnValue(mocks.bucket);
        mocks.bucket.upload.mockResolvedValue({ data: { path: 'school-1/letterhead' }, error: null });
        mocks.bucket.createSignedUrl.mockResolvedValue({
            data: { signedUrl: 'https://project.supabase.co/storage/v1/object/sign/school-letterheads/school-1/letterhead?token=test' },
            error: null,
        });
        mocks.bucket.remove.mockResolvedValue({ data: [], error: null });
        mocks.loadTenant.mockResolvedValue({
            tenantId: 'school-1',
            kopSuratTersedia: true,
            kopSuratPath: 'school-1/letterhead',
        });
        mocks.savePath.mockResolvedValue({ kopSuratPath: 'school-1/letterhead' });
    });

    it('membatasi upload ke gambar raster bertanda tangan dan ukuran maksimal 2 MiB', async () => {
        await expect(unggahKopSuratTenant({ tenantId: 'school-1', userId: 'admin-1', file: pngFile() }))
            .resolves.toMatchObject({ path: 'school-1/letterhead' });
        expect(mocks.storageFrom).toHaveBeenCalledWith(BUCKET_KOP_SEKOLAH);
        expect(mocks.bucket.upload).toHaveBeenCalledWith('school-1/letterhead', expect.any(File), expect.objectContaining({
            upsert: true,
            contentType: 'image/png',
        }));

        await expect(unggahKopSuratTenant({
            tenantId: 'school-1', userId: 'admin-1',
            file: new File(['<svg/>'], 'kop.svg', { type: 'image/svg+xml' }),
        })).rejects.toThrow('SVG tidak diizinkan');
        await expect(unggahKopSuratTenant({
            tenantId: 'school-1', userId: 'admin-1',
            file: pngFile(new Uint8Array(BATAS_KOP_SEKOLAH_BYTE + 1)),
        })).rejects.toThrow('maksimal 2 MiB');
    });

    it('menolak signature palsu dan tidak membuat signed URL lintas tenant', async () => {
        await expect(unggahKopSuratTenant({
            tenantId: 'school-1', userId: 'admin-1', file: pngFile(Uint8Array.from([1, 2, 3, 4])),
        })).rejects.toThrow('Isi berkas tidak sesuai');
        await expect(buatTautanKopSuratTenant('school-1', 'school-2/letterhead'))
            .rejects.toThrow('Path kop tidak cocok');
        expect(mocks.bucket.upload).not.toHaveBeenCalled();
        expect(mocks.bucket.createSignedUrl).not.toHaveBeenCalled();
    });

    it('menyediakan URL sementara dan melepas kop tanpa membuat bucket publik', async () => {
        await expect(buatTautanKopSuratTenant('school-1', 'school-1/letterhead'))
            .resolves.toContain('https://project.supabase.co/');
        await expect(hapusKopSuratTenant({ tenantId: 'school-1', userId: 'admin-1' }))
            .resolves.toEqual({ removed: true, assetDeleted: true });
        expect(mocks.savePath).toHaveBeenCalledWith('school-1', 'admin-1', null);
        expect(mocks.bucket.remove).toHaveBeenCalledWith(['school-1/letterhead']);
    });
});