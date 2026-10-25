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
  muatCatatanPresensiKelas: vi.fn(),
  muatRosterPresensiKelas: vi.fn(),
  muatSesiPresensiKelas: vi.fn(),
}));
vi.mock('../services/classroomJournals.js', () => ({
  listClassroomJournals: vi.fn(),
}));

import ClassroomActivityReportPage from './ClassroomActivityReportPage.jsx';

describe('ClassroomActivityReportPage', () => {
  it('renders the daily/monthly report filters and describes its data scope', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/laporan/harian-bulanan']}>
        <ClassroomActivityReportPage />
      </MemoryRouter>,
    );
    expect(html).toContain('Laporan Harian s.d. Bulanan');
    expect(html).toContain('Semua kelas yang diampu');
    expect(html).toContain('Bulanan');
    expect(html).toContain('tidak mengganti rekap resmi sekolah di luar Ruang Kelas');
    expect(html).toContain('href="#/pelaksanaan/jurnal"');
    expect(html).toContain('href="#/ruang-kelas"');
  });
});
