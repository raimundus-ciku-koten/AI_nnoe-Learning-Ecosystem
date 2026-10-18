import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));

vi.mock('../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));

import GuidanceProgramPage, {
  DIMENSI_PROFIL,
  SARAN_TEMA,
} from './GuidanceProgramPage.jsx';

function renderPage() {
  return renderToStaticMarkup(React.createElement(GuidanceProgramPage));
}

describe('GuidanceProgramPage', () => {
  beforeEach(() => useAuthMock.mockReset());

  it('offers handbook-based optional topic suggestions with a free-text theme input', () => {
    for (const role of ['guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler']) {
      useAuthMock.mockReturnValue({ role });
      const html = renderPage();

      expect(html).toContain('name="tema"');
      expect(html).toContain('list="guidance-topic-suggestions"');
      expect(html).toContain('<datalist id="guidance-topic-suggestions">');
      expect(html).toContain('Menjelajahi pilihan jenjang dan karier');
      expect(html).toContain('Tema bebas dapat diketik');
    }
  });

  it('keeps the planning form unavailable to accounts without the teacher role', () => {
    useAuthMock.mockReturnValue({ role: 'siswa' });
    const html = renderPage();

    expect(html).toContain('role="alert"');
    expect(html).toContain('Hak akses mengikuti peran yang diberikan server.');
    expect(html).not.toContain('<form');
  });

  it('provides phase-based, location-neutral kokurikuler topics and the eight graduate-profile dimensions', () => {
    expect(DIMENSI_PROFIL).toHaveLength(8);
    expect(SARAN_TEMA.kokurikuler.A.length).toBeGreaterThan(0);
    expect(SARAN_TEMA.kokurikuler.B.length).toBeGreaterThan(0);
    expect(SARAN_TEMA.kokurikuler.C.length).toBeGreaterThan(0);
    expect(SARAN_TEMA.kokurikuler.D.length).toBeGreaterThan(0);
    expect(SARAN_TEMA.kokurikuler.E).toHaveLength(14);
    expect(SARAN_TEMA.kokurikuler.F.length).toBeGreaterThanOrEqual(5);
    expect(SARAN_TEMA.kokurikuler.E.join(' ')).not.toMatch(/Tanjung Bunga|Flores Timur|Lamaholot/i);
    expect(SARAN_TEMA.kokurikuler.F.join(' ')).not.toMatch(/Tanjung Bunga|Flores Timur|Lamaholot/i);
  });
});
