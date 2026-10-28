import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PrivacyNoticePage from './PrivacyNoticePage.jsx';

describe('PrivacyNoticePage trial retention notice', () => {
  it('states the public trial and deletion limitations accurately', () => {
    const html = renderToStaticMarkup(React.createElement(PrivacyNoticePage));

    expect(html).toContain('Pendaftaran akun publik dan uji coba telah dihapus');
    expect(html).toContain('mekanisme penghapusan mandiri belum tersedia atau terverifikasi');
    expect(html).not.toContain('mendaftar uji coba lagi');
  });
});
