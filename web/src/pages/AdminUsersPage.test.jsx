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

import AdminUsersPage from './AdminUsersPage.jsx';

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
});
