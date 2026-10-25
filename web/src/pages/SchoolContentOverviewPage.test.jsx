import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ role: 'admin_sekolah', activeRole: null, tenantId: 'tenant-a' }));
const loadContent = vi.hoisted(() => vi.fn());
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../services/schoolContentOverview.js', () => ({
  muatRingkasanKontenSekolah: loadContent,
}));

import SchoolContentOverviewPage from './SchoolContentOverviewPage.jsx';

describe('SchoolContentOverviewPage', () => {
  afterEach(() => {
    loadContent.mockReset();
    auth.role = 'admin_sekolah';
    auth.activeRole = null;
  });

  it('shows tenant content counts and clearly limits their meaning', () => {
    const html = renderToStaticMarkup(<SchoolContentOverviewPage />);
    expect(html).toContain('<h1 id="school-content-title">Ringkasan Materi Sekolah</h1>');
    expect(html).toContain('tidak membuka isi materi, judul, atau data pembuat');
    expect(html).toContain('bukan jumlah materi yang telah ditinjau atau dipublikasikan');
    expect(html).toContain('perpustakaan digital belum termasuk');
  });

  it('uses active role and denies operator access', () => {
    auth.role = 'admin_sekolah';
    auth.activeRole = 'operator';
    const html = renderToStaticMarkup(<SchoolContentOverviewPage />);
    expect(html).toContain('hanya tersedia bagi admin sekolah');
    expect(loadContent).not.toHaveBeenCalled();
  });
});
