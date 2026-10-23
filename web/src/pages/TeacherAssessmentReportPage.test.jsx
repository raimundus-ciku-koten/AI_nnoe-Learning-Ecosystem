import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ role: 'guru' }));
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../services/onlineAssessments.js', () => ({
  muatHasilUjianGuru: vi.fn(async () => []),
}));

import TeacherAssessmentReportPage, {
  buatCsvLaporanPenilaian,
  filterHasilPenilaian,
} from './TeacherAssessmentReportPage.jsx';

describe('teacher assessment report page', () => {
  it('presents a teacher-owned exam results report with scoped filtering', () => {
    auth.role = 'guru';
    const html = renderToStaticMarkup(React.createElement(TeacherAssessmentReportPage));
    expect(html).toContain('Laporan Penilaian Ujian Online');
    expect(html).toContain('dibuat oleh akun guru ini');
    expect(html).toContain('Cari nama siswa atau ujian');
    expect(html).toContain('menunggu penilaian');
    expect(html).toContain('Dari tanggal');
    expect(html).toContain('Unduh CSV (0 hasil)');
  });

  it('denies roles not authorized by the existing teacher results RPC', () => {
    auth.role = 'guru_bk';
    expect(renderToStaticMarkup(React.createElement(TeacherAssessmentReportPage)))
      .toContain('Laporan ini hanya tersedia bagi akun guru');
  });

  it('exports all filtered result fields while neutralizing spreadsheet formulas', () => {
    const csv = buatCsvLaporanPenilaian([{
      student_name: '=HYPERLINK("https://example.invalid")',
      kelas: '7A',
      title: 'Ujian',
      submitted_at: '2026-10-23T08:00:00.000Z',
      objective_correct: 8,
      objective_total: 10,
      score: 80,
      grade_pending: false,
    }]);
    expect(csv).toContain('"\'=HYPERLINK(""https://example.invalid"")"');
    expect(csv).toContain('"2026-10-23T08:00:00.000Z","8","10","80","Dinilai"');
  });

  it('applies inclusive date and class filters to assessment results', () => {
    const rows = [
      { student_name: 'Ayu', kelas: '7A', title: 'Ujian 1', submitted_at: '2026-10-01T08:00:00.000Z' },
      { student_name: 'Bima', kelas: '7B', title: 'Ujian 2', submitted_at: '2026-10-02T08:00:00.000Z' },
      { student_name: 'Citra', kelas: '7A', title: 'Ujian 3', submitted_at: '2026-10-03T08:00:00.000Z' },
    ];
    expect(filterHasilPenilaian(rows, {
      search: 'ujian',
      className: '7A',
      from: '2026-10-01',
      to: '2026-10-03',
    }).map((row) => row.student_name)).toEqual(['Ayu', 'Citra']);
  });
});
