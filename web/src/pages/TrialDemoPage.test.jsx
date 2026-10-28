import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  user: { email: 'demo@example.test' },
  trialExpiresAt: '2099-01-01T00:00:00.000Z',
}));

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => auth,
}));
vi.mock('../auth.js', () => ({
  logout: vi.fn(),
}));

import TrialDemoPage from './TrialDemoPage.jsx';

describe('TrialDemoPage role destination', () => {
  beforeEach(() => {
    auth.trialExpiresAt = '2099-01-01T00:00:00.000Z';
  });

  it('renders the isolated demo instead of school data features', () => {
    const html = renderToStaticMarkup(React.createElement(TrialDemoPage));
    expect(html).toContain('Jelajahi AI_nnoe dengan data contoh');
    expect(html).toContain('Lingkungan simulasi terisolasi');
    expect(html).toContain('Pilihan persona hanya mengubah label simulasi');
    expect(html).not.toContain('#/admin/pengguna');
    expect(html).not.toContain('#/asesmen/bank-soal');
  });
});
