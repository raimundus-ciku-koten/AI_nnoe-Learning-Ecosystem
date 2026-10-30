import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ role: 'superadmin', user: { uid: 'superadmin-1' } }));
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../services/tenantSettings.js', () => ({
    muatPengaturanTenant: vi.fn(),
    simpanProfilTenant: vi.fn(),
    simpanKopSuratTenant: vi.fn(),
}));
vi.mock('../services/tenantLetterhead.js', () => ({
    buatTautanKopSuratTenant: vi.fn(),
    hapusKopSuratTenant: vi.fn(),
    unggahKopSuratTenant: vi.fn(),
}));
vi.mock('../services/platformTenantDirectory.js', () => ({
    buatTenantPlatform: vi.fn(),
    muatHalamanDirektoriTenant: vi.fn(),
}));

import PlatformTenantsPage from './PlatformTenantsPage.jsx';

describe('platform tenant directory page', () => {
    beforeEach(() => {
        auth.role = 'superadmin';
    });

    it('labels the operational summary fields and keeps billing changes out of the directory', () => {
        const html = renderToStaticMarkup(<PlatformTenantsPage />);
        expect(html).toContain('Daftar sekolah');
        expect(html).toContain('Ringkasan tenant, akun, roster, dan pesanan sekolah terbaru');
        expect(html).toContain('Perubahan akses dan langganan tidak dilakukan dari direktori ini');
        expect(html).toContain('Tambah tenant sekolah');
        expect(html).toContain('Buat tenant');
    });

    it('blocks tenant-wide directory access for other roles', () => {
        auth.role = 'guru';
        const html = renderToStaticMarkup(<PlatformTenantsPage />);
        expect(html).toContain('Data tenant lintas sekolah hanya tersedia bagi superadmin');
        expect(html).not.toContain('Pesanan sekolah terbaru');
    });
});
