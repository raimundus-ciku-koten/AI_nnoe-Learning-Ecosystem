import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  user: { uid: 'teacher-1' },
  role: 'guru',
  activeRole: 'guru',
  tenantId: 'school-1',
}));
vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => auth,
}));
vi.mock('../services/tenantSettings.js', () => ({
  muatPengaturanTenant: vi.fn(),
}));
vi.mock('../services/learningClassrooms.js', () => ({
  PERAN_GURU_KELAS: ['guru'],
  muatDaftarRuangKelas: vi.fn(),
  muatRosterPresensiKelas: vi.fn(),
}));
vi.mock('../services/schoolReportCards.js', () => ({
  bukaKembaliPortofolioRapor: vi.fn(),
  bukaKembaliRapor: vi.fn(),
  muatDaftarRapor: vi.fn(),
  muatPortofolioRapor: vi.fn(),
  simpanPortofolioRapor: vi.fn(),
  simpanDrafRapor: vi.fn(),
  terbitkanPortofolioRapor: vi.fn(),
  terbitkanRapor: vi.fn(),
}));

import SchoolReportCardPage from './SchoolReportCardPage.jsx';

function render(path) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <SchoolReportCardPage />
    </MemoryRouter>,
  );
}

describe('SchoolReportCardPage', () => {
  beforeEach(() => {
    auth.role = 'guru';
    auth.activeRole = 'guru';
  });

  it.each(['guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'])(
    'renders the teacher report-card destination for %s',
    (role) => {
      auth.role = role;
      auth.activeRole = role;
      const html = render('/asesmen/rapor');
      expect(html).toContain('Nilai &amp; Capaian Rapor');
      expect(html).toContain('kokurikuler');
      expect(html).toContain('Dimensi profil lulusan');
      expect(html).toContain('presensi');
      expect(html).toContain('e-Rapor SMA 2025.1');
      expect(html).toContain('Modul ini bukan aplikasi e-Rapor resmi');
      expect(html).toContain('Memuat data rapor');
    },
  );

  it.each(['admin', 'admin_sekolah'])('renders the report-card destination for %s', (role) => {
    auth.role = role;
    auth.activeRole = role;
    const html = render('/asesmen/rapor');
    expect(html).toContain('Nilai &amp; Capaian Rapor');
    expect(html).toContain('Admin sekolah');
    expect(html).toContain('Memuat data rapor');
  });
});
