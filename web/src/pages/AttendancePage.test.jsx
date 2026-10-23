import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ role: 'admin_sekolah' }));
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../services/attendanceReports.js', () => ({
  ATTENDANCE_PAGE_SIZE: 100,
  muatLaporanPresensi: vi.fn(async () => []),
}));

import AttendancePage, { buatCsvPresensi } from './AttendancePage.jsx';

describe('attendance page', () => {
  it('presents server-filtered, paginated attendance reports to school staff', () => {
    auth.role = 'admin_sekolah';
    const html = renderToStaticMarkup(React.createElement(AttendancePage));
    expect(html).toContain('Presensi siswa');
    expect(html).toContain('Terapkan filter');
    expect(html).toContain('roster miliknya');
    expect(html).toContain('Semua kelas, mis. 7A');
    expect(html).not.toContain('tabel Supabase');
  });

  it('denies unsupported roles', () => {
    auth.role = 'siswa';
    expect(renderToStaticMarkup(React.createElement(AttendancePage)))
      .toContain('Akses presensi tidak tersedia');
  });

  it('provides an explicitly scoped attendance report and CSV export', () => {
    auth.role = 'admin_sekolah';
    const html = renderToStaticMarkup(React.createElement(AttendancePage, { reportMode: true }));
    expect(html).toContain('Laporan Kehadiran Akademik');
    expect(html).toContain('nilai dan data akademik lain tidak termasuk');
    expect(html).toContain('Unduh CSV (0 baris)');
    expect(html).toContain('CSV hanya berisi baris yang telah dimuat');
  });

  it('quotes CSV values and neutralizes spreadsheet formulas', () => {
    expect(buatCsvPresensi([{
      name: '=HYPERLINK("https://example.invalid")',
      className: '7A',
      date: '2026-10-23',
      status: 'hadir',
      recordedAt: '2026-10-23T01:00:00.000Z',
    }])).toBe(
      '\uFEFF"Nama siswa","Kelas","Tanggal","Status","Waktu dicatat"\r\n' +
      '"\'=HYPERLINK(""https://example.invalid"")","7A","2026-10-23","hadir","2026-10-23T01:00:00.000Z"',
    );
  });
});
