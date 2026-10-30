import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ role: 'admin_sekolah', activeRole: null, tenantId: 'tenant-1' }));
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../services/onlineAssessments.js', () => ({
  buatTautanUjianSiswa: vi.fn(),
  buatUjianSekolahOnline: vi.fn(),
  muatKelasUjianSekolah: vi.fn(),
  muatRosterUjianSekolah: vi.fn(),
  muatSoalUjianSekolah: vi.fn(),
}));
vi.mock('../services/teacherAssignments.js', () => ({ muatGuruTenant: vi.fn() }));
vi.mock('../services/aiIntegrations.js', () => ({ buatDrafSoalDariPDF: vi.fn() }));
vi.mock('../services/pdfTextExtraction.js', () => ({ ekstrakTeksPdf: vi.fn() }));

import SchoolExamBuilderPage from './SchoolExamBuilderPage.jsx';

function renderPage() {
  return renderToStaticMarkup(<SchoolExamBuilderPage />);
}

describe('school exam builder', () => {
  beforeEach(() => {
    auth.role = 'admin_sekolah';
    auth.activeRole = null;
    auth.tenantId = 'tenant-1';
  });

  it('presents tenant-scoped exam creation with reviewed PDF drafts', () => {
    const html = renderPage();
    expect(html).toContain('Buat Ujian Sekolah');
    expect(html).toContain('soal bank sekolah dengan draf yang dibuat dari PDF');
    expect(html).toContain('soal uraian wajib memiliki guru penilai');
  });

  it('denies the page to non-admin active roles', () => {
    auth.role = 'guru';
    expect(renderPage()).toContain('Fitur ini hanya tersedia untuk Admin Sekolah');
  });
});