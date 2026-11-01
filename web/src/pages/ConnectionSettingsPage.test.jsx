import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ConnectionSettingsPage from './ConnectionSettingsPage.jsx';

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { uid: 'user-1' } }),
}));

describe('ConnectionSettingsPage', () => {
  it('renders least-privilege services, local AI and explicit cloud permission', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'cloud' });
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/']}>
        <ConnectionSettingsPage />
      </MemoryRouter>,
    );
    vi.unstubAllGlobals();
    expect(markup).toContain('Google Drive');
    expect(markup).toContain('Google Tasks');
    expect(markup).toContain('calendar.events.owned');
    expect(markup).toContain('AI_nnoe lokal (Ollama)');
    expect(markup).toContain('Nonaktif secara default');
    expect(markup).toContain('Saya memastikan prompt ini tidak sensitif');
  });
});
