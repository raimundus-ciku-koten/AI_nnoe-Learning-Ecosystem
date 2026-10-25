import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ role: 'admin_sekolah', activeRole: null, tenantId: 'tenant-a' }));
const loadActivity = vi.hoisted(() => vi.fn());
const loadChat = vi.hoisted(() => vi.fn());
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../services/schoolActivityOverview.js', () => ({
  muatAktivitasTerbaruSekolah: loadActivity,
  muatRingkasanChatSekolah: loadChat,
}));

import SchoolActivityOverviewPage from './SchoolActivityOverviewPage.jsx';

function renderPage(path) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}><SchoolActivityOverviewPage /></MemoryRouter>,
  );
}

describe('SchoolActivityOverviewPage', () => {
  afterEach(() => {
    loadActivity.mockReset();
    loadChat.mockReset();
    auth.role = 'admin_sekolah';
    auth.activeRole = null;
  });

  it('renders a safe recent-activity destination', () => {
    const html = renderPage('/admin/aktivitas');
    expect(html).toContain('Aktivitas Terbaru');
    expect(html).toContain('100 peristiwa tercatat dalam 30 hari');
    expect(html).toContain('Linimasa ini merangkum aktivitas');
  });

  it('renders aggregate chat monitoring without chat contents', () => {
    const html = renderPage('/admin/dashboard/chat');
    expect(html).toContain('Monitoring Chat');
    expect(html).toContain('Percakapan dibuat · 30 hari');
    expect(html).toContain('Isi chat, identitas peserta, dan status online tidak ditampilkan');
    expect(html).not.toContain('last_text');
  });

  it('uses active role and denies operator access without fetching tenant data', () => {
    auth.role = 'admin_sekolah';
    auth.activeRole = 'operator';
    const html = renderPage('/admin/aktivitas');
    expect(html).toContain('hanya tersedia bagi admin sekolah');
    expect(loadActivity).not.toHaveBeenCalled();
    expect(loadChat).not.toHaveBeenCalled();
  });
});
