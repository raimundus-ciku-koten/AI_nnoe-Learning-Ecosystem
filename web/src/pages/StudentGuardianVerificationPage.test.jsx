import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  role: 'admin_sekolah',
  activeRole: null,
  tenantId: 'school-one',
}));

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => auth,
}));
vi.mock('../services/studentGuardianLinks.js', () => ({
  muatKandidatWaliSiswa: vi.fn(),
  ubahStatusWaliSiswa: vi.fn(),
}));

import StudentGuardianVerificationPage from './StudentGuardianVerificationPage.jsx';

function renderPage() {
  return renderToStaticMarkup(<StudentGuardianVerificationPage />);
}

describe('StudentGuardianVerificationPage', () => {
  beforeEach(() => {
    auth.role = 'admin_sekolah';
    auth.activeRole = null;
    auth.tenantId = 'school-one';
  });

  it.each(['admin', 'admin_sekolah'])('renders tenant-scoped verification for %s', (role) => {
    auth.role = role;
    const html = renderPage();

    expect(html).toContain('Verifikasi hubungan wali-siswa');
    expect(html).toContain('Pilih siswa');
    expect(html).toContain('Pilih akun wali');
    expect(html).toContain('Status penautan pada sekolah ini');
    expect(html).toContain('Riwayat perubahan (100 terakhir)');
    expect(html).toContain('tidak otomatis membuka nilai');
  });

  it('uses the selected role instead of broader base role', () => {
    auth.role = 'admin';
    auth.activeRole = 'operator';

    expect(renderPage()).toContain('hanya tersedia bagi admin sekolah aktif');
  });

  it('denies roles outside the school-admin scope', () => {
    auth.role = 'operator';

    const html = renderPage();
    expect(html).toContain('hanya tersedia bagi admin sekolah aktif');
    expect(html).not.toContain('Pilih siswa');
  });

  it('keeps the control visible but blocks data workflow without a tenant', () => {
    auth.tenantId = null;

    const html = renderPage();
    expect(html).toContain('Verifikasi hubungan wali-siswa');
    expect(html).toContain('Pilih siswa');
  });
});
