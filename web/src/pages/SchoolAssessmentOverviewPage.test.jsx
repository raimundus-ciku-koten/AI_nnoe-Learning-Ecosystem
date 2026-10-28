import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ role: 'admin_sekolah', activeRole: null, tenantId: 'school-a' }));
const load = vi.hoisted(() => vi.fn());
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../services/schoolAssessmentOverview.js', () => ({
  muatRingkasanAsesmenSekolah: load,
}));

import SchoolAssessmentOverviewPage from './SchoolAssessmentOverviewPage.jsx';

function renderPage(path = '/admin/asesmen/monitoring') {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}><SchoolAssessmentOverviewPage /></MemoryRouter>,
  );
}

describe('SchoolAssessmentOverviewPage', () => {
  afterEach(() => {
    load.mockReset();
    auth.role = 'admin_sekolah';
    auth.activeRole = null;
  });

  it.each([
    ['/admin/asesmen/paket', 'Paket ujian'],
    ['/admin/asesmen/jadwal', 'Jadwal ujian'],
    ['/admin/asesmen/monitoring', 'Monitoring ujian'],
    ['/admin/asesmen/analisis', 'Analisis hasil ujian'],
  ])('renders the authenticated admin destination for %s', (path, title) => {
    const html = renderPage(path);
    expect(html).toContain(`<h1 id="school-assessment-title">${title}</h1>`);
    expect(html).toContain('Data dibatasi oleh tenant aktif');
    expect(html).toContain('Daftar ujian sekolah');
  });

  it('supports the admin alias and fails closed for non-admin roles', () => {
    auth.role = 'admin';
    expect(renderPage('/admin/asesmen/paket')).toContain('<h1 id="school-assessment-title">Paket ujian</h1>');
    auth.role = 'operator';
    const html = renderPage();
    expect(html).toContain('hanya tersedia bagi admin sekolah');
    expect(html).not.toContain('Daftar ujian sekolah');
    expect(load).not.toHaveBeenCalled();
  });
});
