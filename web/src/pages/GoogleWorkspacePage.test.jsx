import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import GoogleWorkspacePage from './GoogleWorkspacePage.jsx';

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));
vi.mock('../services/encryptionKeyDirectory.js', () => ({
  simpanKunciPublikPengguna: vi.fn(),
}));

describe('GoogleWorkspacePage', () => {
  it('renders the vault controls without requiring a Drive upload event', () => {
    const markup = renderToStaticMarkup(<GoogleWorkspacePage />);

    expect(markup).toContain('Google Workspace');
    expect(markup).toContain('Buat kunci vault');
    expect(markup).toContain('Vault privat terenkripsi');
  });
});
