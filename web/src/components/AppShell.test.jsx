import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  user: { uid: 'user-test', displayName: 'Pengguna Tes', email: 'test@example.com' },
  profile: {},
  role: 'admin_sekolah',
  activeRole: 'siswa',
  roles: ['admin_sekolah', 'siswa'],
  logout: vi.fn(),
  switchRole: vi.fn(),
}));

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => auth,
}));

import AppShell from './AppShell.jsx';

function renderShell(path) {
  return renderToStaticMarkup(
    <AppShell path={path}>
      <p>Konten halaman</p>
    </AppShell>,
  );
}

describe('AppShell navigasi berdasarkan peran aktif', () => {
  beforeEach(() => {
    auth.role = 'admin_sekolah';
    auth.activeRole = 'siswa';
  });

  it('menampilkan menu siswa dan menandai submenu aktif saat peran aktif berbeda dari peran utama', () => {
    const html = renderShell('/siswa/jadwal');

    expect(html).toContain('Ruang Belajar');
    expect(html).toContain('href="#/siswa/jadwal"');
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain('Operasional Sekolah');
  });

  it('menampilkan menu guru spesialis dari peran aktif', () => {
    auth.activeRole = 'guru_bk';
    const html = renderShell('/pelaksanaan/jurnal');

    expect(html).toContain('Pelaksanaan Pembelajaran');
    expect(html).toContain('Jurnal Mengajar Harian');
    expect(html).not.toContain('Operasional Sekolah');
  });
});
