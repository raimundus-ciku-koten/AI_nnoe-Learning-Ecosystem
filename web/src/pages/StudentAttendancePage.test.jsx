import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../services/studentAttendance.js', () => ({
  muatRiwayatKehadiranSiswa: vi.fn(async () => []),
}));

import StudentAttendancePage from './StudentAttendancePage.jsx';

describe('student attendance page', () => {
  it('renders a clear loading state for the protected student history', () => {
    const html = renderToStaticMarkup(React.createElement(StudentAttendancePage));
    expect(html).toContain('Kehadiran Saya');
    expect(html).toContain('Memuat riwayat kehadiran');
    expect(html).not.toContain('kode_unik');
  });
});
