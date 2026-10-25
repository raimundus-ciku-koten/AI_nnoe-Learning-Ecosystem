import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ role: 'kepala_sekolah', activeRole: null, tenantId: 'school-1' }));
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../services/schoolLeadership.js', () => ({
  muatKelasWali: vi.fn(),
  muatLaporanKelasWali: vi.fn(),
  muatRingkasanKepalaSekolah: vi.fn(),
}));

import SchoolLeadershipPage from './SchoolLeadershipPage.jsx';
import HomeroomAssignmentsPage from './HomeroomAssignmentsPage.jsx';

describe('SchoolLeadershipPage role scope', () => {
  beforeEach(() => {
    auth.role = 'kepala_sekolah';
    auth.activeRole = null;
  });

  it('labels principal metrics as tenant aggregates without student identities', () => {
    const html = renderToStaticMarkup(<SchoolLeadershipPage />);
    expect(html).toContain('Ringkasan Sekolah');
    expect(html).toContain('Statistik agregat seluruh data tersimpan pada tenant sekolah aktif');
    expect(html).toContain('tanpa identitas atau nilai siswa perorangan');
    expect(html).toContain('disembunyikan bila kurang dari lima siswa');
  });

  it('renders the homeroom view with its class-assignment and data exclusions', () => {
    auth.role = 'wali_kelas';
    const html = renderToStaticMarkup(<SchoolLeadershipPage />);
    expect(html).toContain('Pemantauan Kelas Wali');
    expect(html).toContain('kelas yang ditugaskan kepada Anda');
    expect(html).toContain('Jawaban tugas, umpan balik privat, catatan presensi, dan rapor resmi tidak ditampilkan.');
  });

  it('does not render a protected module for an unrelated role', () => {
    auth.role = 'operator';
    const html = renderToStaticMarkup(<SchoolLeadershipPage />);
    expect(html).toContain('Akses terbatas');
    expect(html).not.toContain('Statistik agregat sekolah');
  });

  it('exposes assignment management only to a school admin, not an operator', () => {
    auth.role = 'admin_sekolah';
    expect(renderToStaticMarkup(<HomeroomAssignmentsPage />))
      .toContain('Penugasan Wali Kelas');

    auth.role = 'operator';
    const html = renderToStaticMarkup(<HomeroomAssignmentsPage />);
    expect(html).toContain('Akses admin sekolah diperlukan');
    expect(html).not.toContain('Penugasan per kelas');
  });
});
