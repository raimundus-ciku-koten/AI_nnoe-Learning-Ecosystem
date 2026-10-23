import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  user: { uid: 'school-user' },
  role: 'siswa',
  tenantId: 'school-a',
}));

vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../services/schoolAnnouncements.js', () => ({
  buatPengumumanSekolah: vi.fn(),
  hapusPengumumanSekolah: vi.fn(),
  muatPengumumanSekolah: vi.fn(async () => []),
  ubahPengumumanSekolah: vi.fn(),
}));

import SchoolAnnouncementsPage from './SchoolAnnouncementsPage.jsx';

function renderPage(path) {
  return renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      { initialEntries: [path] },
      React.createElement(SchoolAnnouncementsPage),
    ),
  );
}

describe('school announcements page', () => {
  beforeEach(() => {
    auth.role = 'siswa';
    auth.tenantId = 'school-a';
  });

  it('allows only school admins and operators to see publishing controls', () => {
    for (const role of ['siswa', 'ortu', 'orang_tua', 'guru']) {
      auth.role = role;
      const html = renderPage('/pengumuman/sekolah');
      expect(html, role).toContain('Pengumuman Sekolah');
      expect(html, role).not.toContain('Terbitkan pengumuman');
      expect(html, role).toContain('Memuat pengumuman');
    }

    for (const role of ['admin_sekolah', 'operator']) {
      auth.role = role;
      expect(renderPage('/admin/komunikasi/pengumuman')).toContain('Terbitkan pengumuman');
    }
  });

  it('does not hide missing tenant context behind an empty-state success', () => {
    auth.role = 'ortu';
    auth.tenantId = '';
    expect(renderPage('/pengumuman/sekolah')).toContain('Akun belum terhubung ke sekolah');
  });
});
