import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ role: 'admin_sekolah', activeRole: null, tenantId: 'tenant-a' }));
const loadCatalog = vi.hoisted(() => vi.fn());
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../services/schoolAdminMaterialCatalog.js', () => ({
  muatKatalogMateriAdminSekolah: loadCatalog,
}));

import SchoolAdminMaterialCatalogPage from './SchoolAdminMaterialCatalogPage.jsx';

describe('SchoolAdminMaterialCatalogPage', () => {
  afterEach(() => {
    loadCatalog.mockReset();
    auth.role = 'admin_sekolah';
    auth.activeRole = null;
  });

  it('renders a read-only bounded catalog without bodies or student records', () => {
    const html = renderToStaticMarkup(<SchoolAdminMaterialCatalogPage />);
    expect(html).toContain('<h1 id="school-material-catalog-title">Katalog Materi Ruang Kelas</h1>');
    expect(html).toContain('Hanya 50 materi terakhir');
    expect(html).toContain('Isi materi dan data siswa tidak ditampilkan');
    expect(html).toContain('Perpustakaan digital dan arsip perangkat ajar tidak termasuk');
  });

  it('uses active role and denies operator access without loading materials', () => {
    auth.role = 'admin_sekolah';
    auth.activeRole = 'operator';
    const html = renderToStaticMarkup(<SchoolAdminMaterialCatalogPage />);
    expect(html).toContain('hanya tersedia bagi admin sekolah');
    expect(loadCatalog).not.toHaveBeenCalled();
  });
});
