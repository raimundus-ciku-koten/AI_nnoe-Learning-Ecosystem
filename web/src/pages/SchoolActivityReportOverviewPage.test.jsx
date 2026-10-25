import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ role: 'admin_sekolah', activeRole: null, tenantId: 'tenant-a' }));
const loadReport = vi.hoisted(() => vi.fn());
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../services/schoolActivityReportOverview.js', () => ({
  muatRingkasanAktivitasLaporanSekolah: loadReport,
}));

import SchoolActivityReportOverviewPage from './SchoolActivityReportOverviewPage.jsx';

function renderPage() {
  return renderToStaticMarkup(<SchoolActivityReportOverviewPage />);
}

describe('SchoolActivityReportOverviewPage', () => {
  afterEach(() => {
    loadReport.mockReset();
    auth.role = 'admin_sekolah';
    auth.activeRole = null;
  });

  it('renders a scoped and non-identifying activity report', () => {
    const html = renderPage();
    expect(html).toContain('<h1 id="school-activity-report-title">Ringkasan Aktivitas Kelas</h1>');
    expect(html).toContain('bukan laporan akademik, audit lengkap, atau laporan');
    expect(html).toContain('Tidak ada nama, nilai, catatan individu');
  });

  it('uses active role and denies operator access', () => {
    auth.role = 'admin_sekolah';
    auth.activeRole = 'operator';
    const html = renderPage();
    expect(html).toContain('hanya tersedia bagi admin sekolah');
    expect(loadReport).not.toHaveBeenCalled();
  });
});
