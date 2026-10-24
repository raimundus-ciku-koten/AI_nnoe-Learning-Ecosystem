import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1' },
    role: 'guru',
    activeRole: 'guru',
    tenantId: 'school-1',
  }),
}));
vi.mock('../services/learningClassrooms.js', () => ({
  PERAN_GURU_KELAS: ['guru'],
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
  it('renders analysis and report labels with the official-report limitation', () => {
    expect(render('/asesmen/analisis')).toContain('<h1>Analisis Hasil</h1>');
    const report = render('/laporan/penilaian');
    expect(report).toContain('<h1>Laporan Penilaian</h1>');
    expect(report).toContain('bukan rapor resmi');
    expect(report).toContain('Ekspor CSV');
  });
});
