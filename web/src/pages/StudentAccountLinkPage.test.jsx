import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  role: 'admin_sekolah',
  activeRole: null,
}));

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => auth,
}));
vi.mock('../services/onlineAssessments.js', () => ({
  muatAkunSiswaBelumTertaut: vi.fn(),
  muatAkunSiswaTertaut: vi.fn(),
  muatRosterBelumTertaut: vi.fn(),
  lepasTautanAkunSiswa: vi.fn(),
  tautkanAkunSiswa: vi.fn(),
}));

import StudentAccountLinkPage from './StudentAccountLinkPage.jsx';

function renderPage() {
  return renderToStaticMarkup(React.createElement(StudentAccountLinkPage));
}

describe('StudentAccountLinkPage role destination', () => {
  beforeEach(() => {
    auth.role = 'admin_sekolah';
    auth.activeRole = null;
  });

  it.each(['admin', 'admin_sekolah'])('renders account linking for %s', (role) => {
    auth.role = role;
    const html = renderPage();
    expect(html).toContain('Tautkan akun ke roster siswa');
    expect(html).toContain('Data roster');
  });

  it('does not grant the feature to an operator', () => {
    auth.role = 'operator';
    const html = renderPage();
    expect(html).toContain('hanya tersedia bagi admin sekolah aktif');
    expect(html).not.toContain('Data roster');
  });

  it('honors the selected role for accounts with multiple roles', () => {
    auth.role = 'admin';
    auth.activeRole = 'operator';
    const html = renderPage();
    expect(html).toContain('hanya tersedia bagi admin sekolah aktif');
    expect(html).not.toContain('Data roster');
  });
});
