import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  role: 'admin_sekolah',
  activeRole: null,
  tenantId: 'school-test',
}));

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => auth,
}));
vi.mock('../lib/supabase.ts', () => ({ supabase: {} }));

import AdminUsersPage, {
  penggunaMemilikiKategori,
  peranKategoriPengguna,
} from './AdminUsersPage.jsx';

function render(path = '/admin/pengguna/admin') {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <AdminUsersPage />
    </MemoryRouter>,
  );
}

describe('AdminUsersPage role and route integration', () => {
  beforeEach(() => {
    auth.role = 'admin_sekolah';
    auth.activeRole = null;
    auth.tenantId = 'school-test';
  });

  it.each(['admin', 'admin_sekolah'])('renders the admin destination for %s', (role) => {
    auth.role = role;
    const html = render();
    expect(html).toContain('Manajemen pengguna · tenant sekolah');
    expect(html).toContain('<h2>Admin sekolah</h2>');
  });

  it('shows both admin aliases in the school-admin directory category', () => {
    const source = render();
    expect(source).toContain('<h2>Admin sekolah</h2>');
    expect(source).toContain('Akun admin sekolah');
  });

  it('does not grant the school-admin directory to operators', () => {
    auth.role = 'operator';
    const html = render();
    expect(html).toContain('Daftar ini hanya tersedia bagi admin sekolah');
    expect(html).not.toContain('Manajemen pengguna · tenant sekolah');
  });

  it('uses the selected role when the account has multiple roles', () => {
    auth.role = 'admin';
    auth.activeRole = 'operator';
    const html = render();
    expect(html).toContain('Daftar ini hanya tersedia bagi admin sekolah');
    expect(html).not.toContain('Manajemen pengguna · tenant sekolah');
  });

  it('renders the teacher directory with all specialist teacher roles included', () => {
    const html = render('/admin/pengguna/guru');
    expect(html).toContain('<h2>Guru</h2>');
    expect(peranKategoriPengguna('guru')).toEqual([
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler',
    ]);
    expect(peranKategoriPengguna('tidak-dikenal')).toEqual([]);
  });

  it.each([
    ['/admin/pengguna/guru', '<h2>Guru</h2>'],
    ['/admin/pengguna/siswa', '<h2>Siswa</h2>'],
    ['/admin/pengguna/orang-tua', '<h2>Orang tua</h2>'],
    ['/admin/pengguna/admin', '<h2>Admin sekolah</h2>'],
    ['/admin/pengguna/operator', '<h2>Operator</h2>'],
    ['/admin/pengguna/peran', '<h2>Peran dan hak akses</h2>'],
  ])('renders the admin user destination %s', (path, heading) => {
    expect(render(path)).toContain(heading);
  });

  it('keeps operators separate from teachers and demo users outside the school directory', () => {
    expect(peranKategoriPengguna('operator')).toEqual(['operator']);
    expect(peranKategoriPengguna('guru')).not.toContain('operator');
    expect(peranKategoriPengguna('guru')).not.toContain('demo');
    expect(peranKategoriPengguna('demo')).toEqual([]);
    expect(penggunaMemilikiKategori({ role: 'admin_sekolah', roles: ['admin_sekolah', 'operator'] }, ['operator'])).toBe(true);
    expect(penggunaMemilikiKategori({ role: 'operator' }, peranKategoriPengguna('guru'))).toBe(false);
    expect(render('/admin/pengguna/peran')).toContain('Akun uji coba dikelola di luar direktori pengguna sekolah.');
  });
});
