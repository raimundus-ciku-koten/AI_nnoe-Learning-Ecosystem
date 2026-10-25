import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  user: { uid: 'teacher-1' },
  role: 'guru',
  activeRole: 'guru',
  tenantId: 'school-1',
}));
vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => auth,
}));
vi.mock('../services/learningClassrooms.js', () => ({
  PERAN_GURU_KELAS: ['guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'],
  muatDaftarRuangKelas: vi.fn(),
  muatHasilKuisGuru: vi.fn(),
  muatKuisRuangKelas: vi.fn(),
  muatPengumpulanTugas: vi.fn(),
  muatTugasRuangKelas: vi.fn(),
}));

import ClassroomAssessmentReportPage from './ClassroomAssessmentReportPage.jsx';

function render(path) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <ClassroomAssessmentReportPage />
    </MemoryRouter>,
  );
}

describe('ClassroomAssessmentReportPage', () => {
  beforeEach(() => {
    auth.role = 'guru';
    auth.activeRole = 'guru';
  });

  it('renders analysis and report labels with the official-report limitation', () => {
    expect(render('/asesmen/analisis')).toContain('<h1>Analisis Hasil</h1>');
    const report = render('/laporan/penilaian');
    expect(report).toContain('<h1>Laporan Penilaian</h1>');
    expect(report).toContain('bukan rapor resmi');
    expect(report).toContain('Ekspor CSV');
  });

  it.each(['guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'])(
    'renders the remedial and monitoring destinations for %s',
    (role) => {
      auth.role = role;
      auth.activeRole = role;
      const remedial = render('/asesmen/remedial');
      expect(remedial).toContain('<h1>Remedial &amp; Pengayaan</h1>');
      expect(remedial).toContain('Terapkan kriteria sementara');
      expect(remedial).toContain('bukan keputusan otomatis');
      expect(remedial).toContain('kelas yang Anda ampu');

      const monitoring = render('/pemantauan/catatan');
      expect(monitoring).toContain('<h1>Pemantauan Perkembangan Belajar</h1>');
      expect(monitoring).toContain('status penilaiannya');
      expect(monitoring).toContain('bukan profil siswa');
    },
  );
});
