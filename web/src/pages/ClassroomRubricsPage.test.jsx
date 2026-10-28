import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  user: { uid: 'teacher-1' },
  role: 'guru',
  activeRole: null,
  tenantId: 'tenant-1',
}));

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => auth,
}));
vi.mock('../services/learningClassrooms.js', () => ({
  muatDaftarRuangKelas: vi.fn(),
}));
vi.mock('../services/classroomRubrics.js', () => ({
  buatRubrikKelas: vi.fn(),
  buatVersiRubrikKelas: vi.fn(),
  muatRubrikKelas: vi.fn(),
}));

import ClassroomRubricsPage from './ClassroomRubricsPage.jsx';

function renderPage() {
  return renderToStaticMarkup(<ClassroomRubricsPage />);
}

describe('ClassroomRubricsPage', () => {
  beforeEach(() => {
    auth.role = 'guru';
    auth.activeRole = null;
  });

  it('presents a validated versioned-rubric editor without scoring students', () => {
    const html = renderPage();
    expect(html).toContain('Buat rubrik');
    expect(html).toContain('Nama rubrik');
    expect(html).toContain('Level 1');
    expect(html).toContain('Level 4');
    expect(html).toContain('Tambah kriteria');
    expect(html).toContain('belum memberi skor siswa');
    expect(html).toContain('Jangan masukkan nama siswa');
  });

  it.each(['guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'])(
    'allows teacher role %s to author rubrics',
    (role) => {
      auth.role = role;
      expect(renderPage()).toContain('Buat rubrik');
    },
  );

  it('uses the selected active role and refuses non-teacher roles', () => {
    auth.role = 'admin_sekolah';
    auth.activeRole = 'guru_bk';
    expect(renderPage()).toContain('Buat rubrik');

    auth.activeRole = 'siswa';
    const html = renderPage();
    expect(html).toContain('hanya tersedia untuk peran guru');
    expect(html).not.toContain('Buat rubrik');
  });
});
