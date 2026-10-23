import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PrivacyNoticePage from './PrivacyNoticePage.jsx';

describe('PrivacyNoticePage', () => {
  it('shows the owner-provided privacy contact and keeps unfinished terms explicit', () => {
    const html = renderToStaticMarkup(React.createElement(PrivacyNoticePage));

    expect(html).toContain('AI_nnoe Corp');
    expect(html).toContain('mailto:kotenraimundus@gmail.com');
    expect(html).toContain('jadwal retensi belum ditetapkan');
    expect(html).toContain('prosedur persetujuan orang tua/wali');
    expect(html).toContain('Halaman ini belum menjadi kebijakan privasi final.');
  });
});
