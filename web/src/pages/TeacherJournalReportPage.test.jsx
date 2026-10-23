import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ user: { uid: 'teacher-a' }, role: 'guru', tenantId: 'school-a' }));
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../services/teacherJournals.js', () => ({
  muatJurnalMengajar: vi.fn(async () => []),
  roleDapatMengelolaJurnal: (role) => ['guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'].includes(role),
}));

import TeacherJournalReportPage, { buatCsvLaporanJurnal } from './TeacherJournalReportPage.jsx';

describe('teacher journal report page', () => {
  it('renders a private report with bounded coverage and explicit filters', () => {
    auth.role = 'guru';
    const html = renderToStaticMarkup(React.createElement(TeacherJournalReportPage));
    expect(html).toContain('Laporan Jurnal Mengajar');
    expect(html).toContain('maksimal 200 jurnal terbaru');
    expect(html).toContain('Terapkan filter');
    expect(html).toContain('Unduh CSV');
  });

  it('denies non-teacher roles', () => {
    auth.role = 'admin_sekolah';
    expect(renderToStaticMarkup(React.createElement(TeacherJournalReportPage)))
      .toContain('Akses laporan jurnal tidak tersedia');
  });

  it('escapes CSV cells and neutralizes spreadsheet formula values', () => {
    const csv = buatCsvLaporanJurnal([{
      date: '2026-10-23',
      className: '7A',
      subject: 'Matematika',
      topic: '=HYPERLINK("https://example.invalid")',
      learningObjective: 'Tujuan',
      activities: 'Kegiatan',
      reflection: '',
      followUp: '',
      status: 'selesai',
    }]);
    expect(csv).toContain('"\'=HYPERLINK(""https://example.invalid"")"');
    expect(csv).toContain('"2026-10-23","7A","Matematika"');
  });
});
