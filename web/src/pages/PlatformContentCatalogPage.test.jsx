import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ role: 'superadmin', activeRole: null }));
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../services/platformContentCatalog.js', () => ({
    arsipkanKonten: vi.fn(),
    CONTENT_TYPES: { template_perangkat: 'Template Perangkat', bank_soal: 'Bank Soal Global', modul: 'Modul Global' },
    muatKatalogKonten: vi.fn(),
    simpanDrafKonten: vi.fn(),
    terbitkanKonten: vi.fn(),
}));

import PlatformContentCatalogPage from './PlatformContentCatalogPage.jsx';

describe('PlatformContentCatalogPage', () => {
    beforeEach(() => { auth.role = 'superadmin'; auth.activeRole = null; });

    it('renders the selected global catalog and licensing boundary', () => {
        const html = renderToStaticMarkup(<PlatformContentCatalogPage type="bank_soal" />);
        expect(html).toContain('<h1 id="platform-content-title">Bank Soal Global</h1>');
        expect(html).toContain('lisensi dan sumber yang sah');
        expect(html).toContain('belum memiliki endpoint distribusi');
        expect(html).toContain('Memuat katalog');
        expect(html).not.toContain('Contoh materi');
    });

    it('blocks catalog management for non-superadmin roles', () => {
        auth.role = 'admin_sekolah';
        const html = renderToStaticMarkup(<PlatformContentCatalogPage type="modul" />);
        expect(html).toContain('Katalog konten global hanya tersedia bagi superadmin.');
        expect(html).not.toContain('Buat draf');
    });
});