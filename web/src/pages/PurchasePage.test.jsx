import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));

vi.mock('../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));

import PurchasePage from './PurchasePage.jsx';

function renderPage(role) {
  useAuthMock.mockReturnValue({
    role,
    tenantId: 'school-test',
    user: { uid: 'user-test', displayName: 'Pemohon Uji', email: 'pemohon@example.test' },
  });
  return renderToStaticMarkup(React.createElement(PurchasePage));
}

describe('PurchasePage manual registration roles', () => {
  beforeEach(() => useAuthMock.mockReset());

  it('lets parent roles see individual plans and the manual form without enabling checkout', () => {
    for (const role of ['ortu', 'orang_tua']) {
      const html = renderPage(role);

      expect(html).toContain('Pilih paket akun Anda');
      expect(html).toContain('Ajukan pendaftaran atau permintaan penawaran');
      expect(html).toContain('Orang tua/wali');
      expect(html).toContain('Pembayaran dan checkout online dinonaktifkan');
      expect(html).toContain('tidak membuat pesanan, membuka halaman pembayaran');
      expect(html).not.toContain('Bayar sekarang');
    }
  });

  it('directs student accounts to a parent instead of showing the registration form', () => {
    const html = renderPage('siswa');

    expect(html).toContain('Untuk melindungi data anak');
    expect(html).not.toContain('Nama lengkap pemohon');
  });
});
