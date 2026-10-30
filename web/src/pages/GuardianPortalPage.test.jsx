import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ role: 'orang_tua', activeRole: null, tenantId: 'tenant-1' }));
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../services/guardianPortal.js', () => ({
    lepasTautanWali: vi.fn(),
    muatAkunWaliTenant: vi.fn(),
    muatAnakTertaut: vi.fn(),
    muatNilaiAnak: vi.fn(),
    muatPresensiAnak: vi.fn(),
    muatSiswaTenantUntukWali: vi.fn(),
    muatTautanWaliTenant: vi.fn(),
    tautkanWali: vi.fn(),
}));
vi.mock('../services/schoolChatMonitoring.js', () => ({ muatRingkasanChatSekolah: vi.fn() }));

import AdminGuardianLinksPage from './AdminGuardianLinksPage.jsx';
import AdminChatMonitoringPage from './AdminChatMonitoringPage.jsx';
import ParentPortalPage from './ParentPortalPage.jsx';

function renderPage(Page, path) {
    return renderToStaticMarkup(
        <MemoryRouter initialEntries={[path]}><Page /></MemoryRouter>,
    );
}

describe('guardian portal pages', () => {
    beforeEach(() => {
        auth.role = 'orang_tua';
        auth.activeRole = null;
    });

    it('renders parent summary and result routes without the read-only placeholder', () => {
        const summary = renderPage(ParentPortalPage, '/orang-tua/anak');
        const results = renderPage(ParentPortalPage, '/orang-tua/nilai-kehadiran');
        expect(summary).toContain('Ringkasan anak');
        expect(summary).toContain('siswa yang ditautkan secara resmi');
        expect(results).toContain('Nilai dan kehadiran');
        expect(results).toContain('Memuat data tertaut');
        expect(results).toContain('href="#/orang-tua/nilai-kehadiran"');
        expect(results).not.toContain('Panduan · baca saja');
    });

    it('blocks parent screens for unrelated active roles', () => {
        auth.role = 'admin_sekolah';
        expect(renderPage(ParentPortalPage, '/orang-tua/anak')).toContain('Halaman ini hanya tersedia untuk akun orang tua.');
    });

    it('renders tenant-scoped guardian link management for school admins only', () => {
        auth.role = 'admin_sekolah';
        expect(renderPage(AdminGuardianLinksPage, '/admin/pengguna/tautkan-wali')).toContain('Tautkan orang tua ke siswa');
        auth.role = 'guru';
        expect(renderPage(AdminGuardianLinksPage, '/admin/pengguna/tautkan-wali')).toContain('hanya tersedia bagi admin sekolah');
    });

    it('renders privacy-bounded chat monitoring only for school admins', () => {
        auth.role = 'admin_sekolah';
        const html = renderPage(AdminChatMonitoringPage, '/admin/dashboard/chat');
        expect(html).toContain('Aktivitas chat');
        expect(html).toContain('tidak menampilkan nama anggota, isi pesan');
        auth.role = 'guru';
        expect(renderPage(AdminChatMonitoringPage, '/admin/dashboard/chat')).toContain('hanya tersedia bagi admin sekolah');
    });
});