import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ role: 'admin_sekolah', activeRole: null, tenantId: 'tenant-1' }));
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../services/onlineAssessments.js', () => ({ muatRingkasanUjianSekolah: vi.fn() }));
vi.mock('../services/schoolReporting.js', () => ({
    muatLaporanKehadiranSekolah: vi.fn(),
    muatLaporanKehadiranSekolahRentang: vi.fn(),
    muatPesananKeuanganSekolah: vi.fn(),
    muatHalamanPesananKeuanganSekolah: vi.fn(),
    muatRingkasanKeuanganSekolah: vi.fn(),
    muatSemuaPesananKeuanganSekolah: vi.fn(),
}));

import SchoolFinancePage from './SchoolFinancePage.jsx';
import SchoolReportsPage from './SchoolReportsPage.jsx';
import AdminAssessmentPage from './AdminAssessmentPage.jsx';

function renderPage(Page, path) {
    return renderToStaticMarkup(<MemoryRouter initialEntries={[path]}><Page /></MemoryRouter>);
}

describe('school reports and finance pages', () => {
    beforeEach(() => {
        auth.role = 'admin_sekolah';
        auth.activeRole = null;
        auth.tenantId = 'tenant-1';
    });

    it('renders distinct reports and finance routes with honest data boundaries', () => {
        const academic = renderPage(SchoolReportsPage, '/admin/laporan/akademik');
        const exportView = renderPage(SchoolReportsPage, '/admin/laporan/ekspor');
        const financeReport = renderPage(SchoolReportsPage, '/admin/laporan/keuangan');
        const finance = renderPage(SchoolFinancePage, '/admin/keuangan/tagihan');
        expect(academic).toContain('Laporan Akademik');
        expect(academic).toContain('bukan status alfa');
        expect(exportView).toContain('Ekspor Laporan');
        expect(exportView).toContain('Memuat laporan tenant');
        expect(academic).toContain('Terapkan periode');
        expect(financeReport).toContain('Laporan keuangan');
        expect(finance).toContain('Tagihan sekolah');
        expect(finance).toContain('Checkout dan perubahan status pembayaran tetap dinonaktifkan');
        expect(finance).toContain('Memuat laporan keuangan');
    });

    it('blocks tenant reports and finance pages for other roles', () => {
        auth.role = 'guru';
        expect(renderPage(SchoolReportsPage, '/admin/laporan/akademik')).toContain('Laporan tenant hanya tersedia bagi admin sekolah');
        expect(renderPage(SchoolFinancePage, '/admin/keuangan/pembayaran')).toContain('Keuangan tenant hanya tersedia bagi admin sekolah');
    });

    it('shows refresh and aggregate CSV actions in the school assessment monitor', () => {
        const html = renderPage(AdminAssessmentPage, '/admin/asesmen/monitoring');
        const packages = renderPage(AdminAssessmentPage, '/admin/asesmen/paket');
        expect(html).toContain('Monitoring Ujian');
        expect(html).toContain('Memuat ulang');
        expect(html).toContain('Ekspor CSV');
        expect(html).toContain('Nama siswa, jawaban, kunci, dan nilai individual tidak ditampilkan');
        expect(packages).toContain('guru atau Admin Sekolah');
    });
});