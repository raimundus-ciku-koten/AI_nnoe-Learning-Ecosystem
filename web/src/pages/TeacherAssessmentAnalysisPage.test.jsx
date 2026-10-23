import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ role: 'guru' }));
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../services/onlineAssessments.js', () => ({
  muatHasilUjianGuru: vi.fn(async () => []),
}));

import TeacherAssessmentAnalysisPage from './TeacherAssessmentAnalysisPage.jsx';

describe('teacher assessment analysis page', () => {
  it('renders a scoped analysis with clear metric definitions', () => {
    auth.role = 'guru';
    const html = renderToStaticMarkup(React.createElement(TeacherAssessmentAnalysisPage));
    expect(html).toContain('Analisis Hasil Ujian');
    expect(html).toContain('hanya mencakup hasil yang sudah dinilai');
    expect(html).toContain('tanpa pagination server');
    expect(html).toContain('Memuat hasil untuk dianalisis');
  });

  it('denies roles outside the existing results RPC contract', () => {
    auth.role = 'guru_bk';
    expect(renderToStaticMarkup(React.createElement(TeacherAssessmentAnalysisPage)))
      .toContain('Analisis ini hanya tersedia bagi akun guru');
  });
});
