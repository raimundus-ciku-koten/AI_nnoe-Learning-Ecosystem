import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  role: 'guru',
  activeRole: 'guru',
  user: { uid: 'teacher-1' },
  tenantId: 'tenant-1',
}));

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => auth,
}));

import ClassroomJournalPage from './ClassroomJournalPage.jsx';

describe('ClassroomJournalPage', () => {
  it('menyediakan form jurnal akademik dan bukan laporan presensi/nilai', () => {
    auth.role = 'guru';
    auth.activeRole = 'guru';
    const html = renderToStaticMarkup(<ClassroomJournalPage />);
    expect(html).toContain('Jurnal Mengajar');
    expect(html).toContain('Tujuan pembelajaran');
    expect(html).toContain('Kegiatan dan pelaksanaan');
    expect(html).toContain('Refleksi pembelajaran');
    expect(html).toContain('Jurnal ini terpisah dari presensi, nilai, dan laporan resmi');
  });

  it('mendukung peran guru spesialis aktif pada akun multi-role', () => {
    auth.role = 'admin_sekolah';
    auth.activeRole = 'guru_bk';
    expect(renderToStaticMarkup(<ClassroomJournalPage />)).toContain('Jurnal Mengajar');
  });

  it('menolak akses role yang tidak berhak', () => {
    auth.role = 'siswa';
    auth.activeRole = 'siswa';
    expect(renderToStaticMarkup(<ClassroomJournalPage />))
      .toContain('Akses jurnal mengajar dibatasi');
  });
});
