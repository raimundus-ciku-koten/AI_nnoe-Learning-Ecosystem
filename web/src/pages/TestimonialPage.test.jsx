import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  user: { uid: 'user-test' },
  role: 'admin_sekolah',
  activeRole: null,
  tenantId: 'school-test',
  profile: {},
}));

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => auth,
}));
vi.mock('../lib/supabase.ts', () => ({ supabase: {} }));

import TestimonialPage from './TestimonialPage.jsx';

function renderPage() {
  return renderToStaticMarkup(React.createElement(TestimonialPage));
}

describe('TestimonialPage moderation destination', () => {
  beforeEach(() => {
    auth.role = 'admin_sekolah';
    auth.activeRole = null;
  });

  it.each(['admin', 'admin_sekolah'])('renders moderation for %s', (role) => {
    auth.role = role;
    const html = renderPage();
    expect(html).toContain('Antrean moderasi sekolah');
    expect(html).not.toContain('Kirim testimoni Anda');
  });

  it('does not grant moderation to operator', () => {
    auth.role = 'operator';
    const html = renderPage();
    expect(html).not.toContain('Antrean moderasi sekolah');
    expect(html).toContain('Kirim testimoni Anda');
  });

  it('honors the selected role when the account has multiple roles', () => {
    auth.role = 'admin';
    auth.activeRole = 'operator';
    const html = renderPage();
    expect(html).not.toContain('Antrean moderasi sekolah');
    expect(html).toContain('Kirim testimoni Anda');
  });
});
