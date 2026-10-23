import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ role: 'admin_sekolah', tenantId: 'school-a', user: { uid: 'admin-a' } }));
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../services/tenantSettings.js', () => ({
  muatPengaturanTenant: vi.fn(async () => ({
    nama: 'Sekolah Contoh',
    npsn: '',
    kepalaSekolah: '',
    nipKepalaSekolah: '',
    tahunAjaran: '2026/2027',
    semester: 'Ganjil',
  })),
  simpanProfilTenant: vi.fn(),
  simpanSiklusTenant: vi.fn(),
}));

import SchoolSettingsPage from './SchoolSettingsPage.jsx';

function render(path) {
  return renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      { initialEntries: [path] },
      React.createElement(SchoolSettingsPage),
    ),
  );
}

describe('school settings page', () => {
  it('presents tenant profile fields and academic-cycle navigation', () => {
    auth.role = 'admin_sekolah';
    const html = render('/admin/instansi/profil');
    expect(html).toContain('Profil Sekolah');
    expect(html).toContain('Nama sekolah');
    expect(html).toContain('NPSN');
    expect(html).toContain('Nama kepala sekolah');
    expect(html).toContain('Tahun Ajaran &amp; Semester');
  });

  it('presents validated academic year and semester fields', () => {
    const html = render('/admin/instansi/tahun-ajaran');
    expect(html).toContain('Siklus Akademik Aktif');
    expect(html).toContain('pattern="\\d{4}/\\d{4}"');
    expect(html).toContain('Semester berjalan');
    expect(html).toContain('Simpan siklus akademik');
  });

  it('denies roles without school-admin authority', () => {
    auth.role = 'operator';
    expect(render('/admin/instansi/profil')).toContain('Akses pengaturan sekolah tidak tersedia');
    auth.role = 'admin_sekolah';
  });

  it('requires a tenant scope before rendering editable settings', () => {
    auth.tenantId = '';
    expect(render('/admin/instansi/profil')).toContain('Sekolah aktif tidak tersedia');
    auth.tenantId = 'school-a';
  });
});
