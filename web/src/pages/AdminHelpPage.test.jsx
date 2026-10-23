import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ role: 'admin_sekolah' }));
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => auth }));

import AdminHelpPage from './AdminHelpPage.jsx';

function render(path) {
  return renderToStaticMarkup(
    React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(AdminHelpPage)),
  );
}

describe('admin help center', () => {
  it('provides operational guidance without claiming unsupported readiness', () => {
    auth.role = 'admin_sekolah';
    const html = render('/admin/bantuan/panduan');
    expect(html).toContain('Panduan Admin');
    expect(html).toContain('Periksa konteks sekolah');
    expect(html).toContain('Beberapa menu belum memiliki fungsi domain aktif');
    expect(html).toContain('kata sandi, secret, token');
  });

  it('answers common questions with links to available admin workflows', () => {
    const html = render('/admin/bantuan/faq');
    expect(html).toContain('Pertanyaan yang sering diajukan');
    expect(html).toContain('Buka pengaturan sekolah');
    expect(html).toContain('Buka kanal pengumuman');
    expect(html).toContain('backup/restore disposable');
    expect(html).toContain('Free tier dapat berubah');
  });

  it('offers in-app chat without pretending to submit a support ticket', () => {
    const html = render('/admin/bantuan/support');
    expect(html).toContain('Kontak Support');
    expect(html).toContain('href="#/chat"');
    expect(html).toContain('tidak mengirim tiket atau pesan otomatis');
  });

  it('denies other roles', () => {
    auth.role = 'guru';
    expect(render('/admin/bantuan/faq')).toContain('Pusat bantuan admin tidak tersedia');
    auth.role = 'admin_sekolah';
  });
});
