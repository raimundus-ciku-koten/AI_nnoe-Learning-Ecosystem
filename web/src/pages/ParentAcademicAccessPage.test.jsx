import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  role: 'ortu',
  activeRole: null,
}));

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => auth,
}));

import ParentAcademicAccessPage from './ParentAcademicAccessPage.jsx';

function render() {
  return renderToStaticMarkup(<ParentAcademicAccessPage />);
}

describe('ParentAcademicAccessPage', () => {
  beforeEach(() => {
    auth.role = 'ortu';
    auth.activeRole = null;
  });

  it.each(['ortu', 'orang_tua'])('renders a fail-closed gate for %s without student data', (role) => {
    auth.role = role;
    const html = render();

    expect(html).toContain('Informasi akademik belum tersedia');
    expect(html).toContain('Sekolah belum memverifikasi hubungan akun wali dengan siswa');
    expect(html).toContain('href="#/pengumuman"');
    expect(html).toContain('href="#/chat"');
    expect(html).not.toContain('<table');
    expect(html).not.toContain('Nilai:');
  });

  it('uses the selected role for accounts with multiple roles', () => {
    auth.role = 'admin_sekolah';
    auth.activeRole = 'orang_tua';

    expect(render()).toContain('Informasi akademik belum tersedia');
  });

  it('does not render parent academic content for other roles', () => {
    auth.role = 'guru';

    const html = render();
    expect(html).toContain('Halaman ini hanya tersedia bagi akun orang tua atau wali.');
    expect(html).not.toContain('Sekolah belum memverifikasi hubungan akun wali dengan siswa');
  });
});
