import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { validasiDataCover } from '../services/coverHistory.js';

const { auth } = vi.hoisted(() => ({
  auth: { user: null, role: 'guru', activeRole: '', tenantId: '' },
}));
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => auth }));

import CoverGeneratorPage, { CoverPages } from './CoverGeneratorPage.jsx';

const COVER = {
  mapel: 'Matematika',
  kelas: 'X',
  tahunAjaran: '',
  penyusun: '',
  sekolah: '',
  tingkat: '',
  logoDataUrl: '',
};

describe('CoverGeneratorPage', () => {
  it('only exposes the generator to teacher roles', () => {
    auth.role = 'siswa';
    const markup = renderToStaticMarkup(<CoverGeneratorPage />);
    expect(markup).toContain('Cover perangkat hanya dapat dikelola oleh guru');
    expect(markup).toContain('role="alert"');
  });

  it('keeps metadata optional and clearly explains local-only storage', () => {
    auth.role = 'guru';
    auth.user = { uid: 'teacher-1' };
    const markup = renderToStaticMarkup(<CoverGeneratorPage />);
    expect(markup).toContain('Mata pelajaran');
    expect(markup).toContain('Kelas/Fase');
    expect(markup).toContain('Riwayat hanya tersimpan di browser dan perangkat ini');
    expect(markup).toContain('Cetak / Simpan sebagai PDF');
    expect(markup).not.toContain('Generate dengan AI');
  });

  it('renders exactly two A4 cover sides and escapes user-provided text', () => {
    const data = validasiDataCover({
      ...COVER,
      mapel: 'Matematika <script>alert(1)</script>',
      logoDataUrl: 'data:image/png;base64,AAAA',
    });
    const markup = renderToStaticMarkup(<CoverPages data={data} />);
    expect(markup.match(/class="cover-page cover-(?:front|back)"/g)).toHaveLength(2);
    expect(markup).toContain('class="cover-page cover-front"');
    expect(markup).toContain('class="cover-page cover-back"');
    expect(markup).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(markup).toContain('src="data:image/png;base64,AAAA"');
  });
});
