import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  role: 'admin_sekolah',
  activeRole: 'guru',
  user: { uid: 'user-test', displayName: 'Pengguna Tes' },
  profile: {},
  roles: ['admin_sekolah', 'guru'],
  logout: vi.fn(),
  switchRole: vi.fn(),
}));

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => auth,
}));
vi.mock('../services/protectedMedia.js', () => ({
  urlFotoAman: () => false,
}));
vi.mock('../services/economyMode.js', () => ({
  isEconomyMode: () => false,
}));
vi.mock('../ui.js', () => ({
  LABEL_PERAN: { guru: 'Guru', admin_sekolah: 'Admin Sekolah', superadmin: 'Super Admin' },
  inisial: () => 'PT',
  sideTutupTersimpan: () => false,
  terapkanSideTutup: vi.fn(),
  toast: vi.fn(),
}));

import AppShell from './AppShell.jsx';

function renderSidebar(path) {
  return renderToStaticMarkup(
    <AppShell path={path}><p>Konten</p></AppShell>,
  );
}

describe('sidebar mengikuti peran aktif', () => {
  beforeEach(() => {
    auth.role = 'admin_sekolah';
    auth.activeRole = 'guru';
  });

  it('menampilkan grup dan submenu guru untuk peran aktif guru', () => {
    const html = renderSidebar('/datadasar/jadwal');

    expect(html).toContain('Data Dasar');
    expect(html).toContain('Jadwal Mengajar');
    expect(html).not.toContain('Manajemen Instansi');
  });

  it('beralih ke grup dan submenu superadmin saat peran aktif berubah', () => {
    auth.activeRole = 'superadmin';
    const tenantsHtml = renderSidebar('/platform/tenant/sekolah');
    const usersHtml = renderSidebar('/platform/pengguna/superadmin');

    expect(tenantsHtml).toContain('Manajemen Tenant');
    expect(tenantsHtml).toContain('Tambah Tenant');
    expect(usersHtml).toContain('Manajemen Pengguna Global');
    expect(usersHtml).toContain('Tambah Super Admin');
    expect(usersHtml).not.toContain('Data Dasar');
  });
});
