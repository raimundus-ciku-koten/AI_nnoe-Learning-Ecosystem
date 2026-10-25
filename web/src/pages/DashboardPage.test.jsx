import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';

const { auth } = vi.hoisted(() => ({
  auth: {
    user: { displayName: 'Guru Tes' },
    profile: { sekolah: 'Sekolah Tes', langganan: true },
    role: 'guru',
    activeRole: null,
    isDemo: false,
  },
}));

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => auth,
}));

vi.mock('../ui.js', () => ({
  LABEL_PERAN: { guru: 'Guru' },
  salam: () => 'Selamat pagi',
}));

import DashboardPage from './DashboardPage.jsx';

describe('dashboard quick links', () => {
  beforeEach(() => {
    auth.role = 'guru';
    auth.activeRole = null;
  });

  it('links schedule, online assessment, and question bank to available modules', () => {
    const html = renderToStaticMarkup(React.createElement(DashboardPage));

    expect(html).toContain('href="#/datadasar/jadwal"');
    expect(html).toContain('href="#/asesmen/ujian-online"');
    expect(html).toContain('href="#/asesmen/bank-soal"');
    expect(html).not.toContain('Segera hadir');
    expect(html).not.toContain('aria-disabled="true"');
    expect(html).not.toContain('Langganan');
  });

  it.each(['kepala_sekolah', 'wali_kelas', 'operator', 'siswa', 'ortu', 'superadmin'])(
    'does not show unauthorized teacher links to %s',
    (role) => {
      auth.role = role;
      const html = renderToStaticMarkup(React.createElement(DashboardPage));
      expect(html).not.toContain('href="#/perencanaan"');
      expect(html).not.toContain('href="#/datadasar/jadwal"');
      expect(html).not.toContain('href="#/asesmen/ujian-online"');
      expect(html).not.toContain('href="#/asesmen/bank-soal"');
    },
  );

  it('uses the selected role instead of the account base role for dashboard links', () => {
    auth.role = 'admin';
    auth.activeRole = 'operator';
    const html = renderToStaticMarkup(React.createElement(DashboardPage));
    expect(html).not.toContain('href="#/perencanaan"');
    expect(html).not.toContain('href="#/datadasar/jadwal"');
  });
});
