import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  role: 'guru',
  activeRole: null,
  user: { uid: 'teacher-test' },
}));

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => auth,
}));
vi.mock('../lib/supabase.ts', () => ({ supabase: {} }));

import AttendancePage from './AttendancePage.jsx';

function render() {
  return renderToStaticMarkup(<AttendancePage />);
}

describe('AttendancePage role destination', () => {
  beforeEach(() => {
    auth.role = 'guru';
    auth.activeRole = null;
    auth.user = { uid: 'teacher-test' };
  });

  it.each(['guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'])(
    'renders the attendance destination for %s',
    (role) => {
      auth.role = role;

      expect(render()).toContain('<h1>Presensi siswa</h1>');
    },
  );

  it('uses the selected specialist teacher role for an account with multiple roles', () => {
    auth.role = 'admin_sekolah';
    auth.activeRole = 'guru_bk';

    expect(render()).toContain('<h1>Presensi siswa</h1>');
  });

  it('denies roles outside the educator and school operations scope', () => {
    auth.role = 'siswa';

    expect(render()).toContain('Akses presensi tidak tersedia');
  });
});
