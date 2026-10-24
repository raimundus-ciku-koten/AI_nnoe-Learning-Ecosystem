import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { auth, controls } = vi.hoisted(() => ({
  auth: { user: { uid: 'teacher-test' }, role: 'guru', tenantId: 'school-test' },
  controls: { features: { aiGeneration: true } },
}));

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => auth,
}));

vi.mock('../context/PlatformControlContext.jsx', () => ({
  usePlatformControls: () => controls,
}));

vi.mock('../services/questionBank.js', () => ({
  hapusSoalBank: vi.fn(),
  muatBankSoal: vi.fn(),
  tambahSoalBank: vi.fn(),
  ubahSoalBank: vi.fn(),
}));

vi.mock('../services/aiIntegrations.js', () => ({
  buatDrafSoalAI: vi.fn(),
}));

import QuestionBankPage from './QuestionBankPage.jsx';

function renderPage() {
  return renderToStaticMarkup(React.createElement(QuestionBankPage));
}

describe('Question Bank AI mode choices', () => {
  beforeEach(() => {
    controls.features.aiGeneration = true;
    auth.role = 'guru';
  });

  it('offers local AI_nnoe and external AI choices when enabled by the administrator', () => {
    const html = renderPage();

    expect(html).toContain('1. Gunakan AI_nnoe');
    expect(html).toContain('2. Gunakan AI_eksternal');
    expect(html).toContain('Berjalan dengan model AI lokal yang tersedia di perangkat ini.');
    expect(html).toContain('API key pribadi');
    expect(html).toContain('checked=""');
  });

  it('keeps AI mode choices hidden when the administrator disables generation', () => {
    controls.features.aiGeneration = false;
    const html = renderPage();

    expect(html).not.toContain('Gunakan AI_nnoe');
    expect(html).not.toContain('Gunakan AI_eksternal');
    expect(html).toContain('Pembuatan draf AI sedang dinonaktifkan oleh administrator.');
  });
});
