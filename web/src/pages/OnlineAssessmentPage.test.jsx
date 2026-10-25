import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  role: 'guru',
  activeRole: null,
  tenantId: 'school-test',
  user: { uid: 'teacher-test' },
}));

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => auth,
}));

vi.mock('../services/onlineAssessments.js', () => ({
  buatUjianOnline: vi.fn(),
  daftarDraftUjian: vi.fn(),
  hapusDraftUjian: vi.fn(),
  kirimJawabanUjian: vi.fn(),
  muatJawabanUraianGuru: vi.fn(),
  muatHasilUjianGuru: vi.fn(),
  muatRingkasanUjianGuru: vi.fn(),
  muatDraftUjian: vi.fn(),
  muatSoalUjianGuru: vi.fn(),
  muatUjianSiswa: vi.fn(),
  mulaiUjianOnline: vi.fn(),
  nilaiJawabanUraian: vi.fn(),
  simpanDraftUjian: vi.fn(),
}));

import OnlineAssessmentPage from './OnlineAssessmentPage.jsx';

function render() {
  return renderToStaticMarkup(<OnlineAssessmentPage />);
}

describe('OnlineAssessmentPage role destination', () => {
  beforeEach(() => {
    auth.role = 'guru';
    auth.activeRole = null;
    auth.tenantId = 'school-test';
    auth.user = { uid: 'teacher-test' };
  });

  it.each(['guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'])(
    'renders the teacher exam destination for %s',
    (role) => {
      auth.role = role;

      expect(render()).toContain('Jadwalkan Ujian Online');
    },
  );

  it('uses the selected teacher role for a multi-role account', () => {
    auth.role = 'admin_sekolah';
    auth.activeRole = 'guru_ekstrakurikuler';

    expect(render()).toContain('Jadwalkan Ujian Online');
  });

  it('renders the student exam destination for the student role', () => {
    auth.role = 'siswa';

    expect(render()).toContain('Ujian Saya');
  });

  it('fails closed when a teacher session has no user or school tenant', () => {
    auth.user = null;
    auth.tenantId = '';

    expect(render()).toContain('Modul ini tersedia untuk akun guru atau siswa aktif');
  });
});
