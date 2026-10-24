import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const { auth } = vi.hoisted(() => ({
  auth: {
    user: { displayName: 'Guru Tes' },
    profile: { sekolah: 'Sekolah Tes', langganan: true },
    role: 'guru',
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
  it('links schedule, online assessment, and question bank to available modules', () => {
    const html = renderToStaticMarkup(React.createElement(DashboardPage));

    expect(html).toContain('href="#/datadasar/jadwal"');
    expect(html).toContain('href="#/asesmen/ujian-online"');
    expect(html).toContain('href="#/asesmen/bank-soal"');
    expect(html).not.toContain('Segera hadir');
    expect(html).not.toContain('aria-disabled="true"');
    expect(html).not.toContain('Langganan');
  });
});
