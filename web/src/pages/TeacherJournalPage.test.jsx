import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ user: { uid: 'teacher-a' }, role: 'guru', tenantId: 'school-a' }));
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../services/teacherJournals.js', () => ({
  hapusJurnalMengajar: vi.fn(),
  muatJurnalMengajar: vi.fn(async () => []),
  muatKelasRosterGuru: vi.fn(async () => ['7A']),
  roleDapatMengelolaJurnal: (role) => role.startsWith('guru'),
  simpanJurnalMengajar: vi.fn(),
  ubahJurnalMengajar: vi.fn(),
}));

import TeacherJournalPage from './TeacherJournalPage.jsx';

describe('teacher journal page', () => {
  it('renders a private, student-identity-free daily journal workflow', () => {
    auth.role = 'guru';
    const html = renderToStaticMarkup(React.createElement(TeacherJournalPage));
    expect(html).toContain('Jurnal Mengajar Harian');
    expect(html).toContain('Tujuan pembelajaran');
    expect(html).toContain('Refleksi');
    expect(html).toContain('Tindak lanjut');
    expect(html).toContain('Jangan masukkan nama atau identitas siswa');
  });

  it('denies non-teacher roles', () => {
    auth.role = 'siswa';
    expect(renderToStaticMarkup(React.createElement(TeacherJournalPage)))
      .toContain('Akses jurnal mengajar tidak tersedia');
  });
});
