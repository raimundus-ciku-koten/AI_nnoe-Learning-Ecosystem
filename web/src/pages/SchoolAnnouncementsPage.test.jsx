import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  role: 'admin_sekolah',
  activeRole: 'admin_sekolah',
  user: { uid: 'school-admin' },
  tenantId: 'school-1',
}));

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => auth,
}));
vi.mock('../services/schoolAnnouncements.js', () => ({
  buatPengumumanSekolah: vi.fn(),
  daftarPengumumanSekolah: vi.fn(),
  hapusPengumumanSekolah: vi.fn(),
  perbaruiPengumumanSekolah: vi.fn(),
}));

import SchoolAnnouncementsPage from './SchoolAnnouncementsPage.jsx';

function renderPage() {
  return renderToStaticMarkup(<SchoolAnnouncementsPage />);
}

describe('SchoolAnnouncementsPage', () => {
  it('menampilkan editor untuk admin sekolah dan tidak mengiklankan broadcast otomatis', () => {
    auth.role = 'admin_sekolah';
    auth.activeRole = 'admin_sekolah';
    const html = renderPage();
    expect(html).toContain('Buat pengumuman');
    expect(html).toContain('Terbitkan');
    expect(html).toContain('tidak mengirim email, push notification, atau pesan broadcast otomatis');
  });

  it('menampilkan editor untuk operator berdasarkan peran aktif', () => {
    auth.role = 'guru';
    auth.activeRole = 'operator';
    expect(renderPage()).toContain('Buat pengumuman');
  });

  it('menampilkan kanal baca tanpa editor bagi siswa dan orang tua', () => {
    auth.role = 'siswa';
    auth.activeRole = 'siswa';
    const html = renderPage();
    expect(html).toContain('Pengumuman sekolah');
    expect(html).not.toContain('Buat pengumuman');
    expect(html).not.toContain('Terbitkan');

    auth.role = 'orang_tua';
    auth.activeRole = 'orang_tua';
    expect(renderPage()).not.toContain('Buat pengumuman');
  });
});
