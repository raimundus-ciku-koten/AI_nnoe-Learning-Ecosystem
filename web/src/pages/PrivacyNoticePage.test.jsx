import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PrivacyNoticePage from './PrivacyNoticePage.jsx';

describe('PrivacyNoticePage', () => {
  it('shows the owner-provided contact and labels retention and guardian terms as unimplemented drafts', () => {
    const html = renderToStaticMarkup(React.createElement(PrivacyNoticePage));

    expect(html).toContain('AI_nnoe Corp');
    expect(html).toContain('mailto:kotenraimundus@gmail.com');
    expect(html).toContain('Akun dan profil: hapus atau anonimisasi paling lambat 90 hari');
    expect(html).toContain('Log keamanan: simpan hingga 90 hari');
    expect(html).toContain('Cadangan: masa simpan bergulir hingga 30 hari');
    expect(html).toContain('retensi satu hari pada workflow saat ini');
    expect(html).toContain('Workflow itu tidak menyimpan ke R2');
    expect(html).toContain('Dasar pemrosesan untuk tiap tujuan');
    expect(html).toContain('Pemberitahuan ini bukan penetapan bahwa persetujuan adalah satu-satunya dasar pemrosesan');
    expect(html).toContain('Draf usulan');
    expect(html).toContain('Proses pencatatan/verifikasi persetujuan dan pemenuhan permintaan belum diuji');
    expect(html).toContain('halaman ini belum menjadi kebijakan privasi final.');
  });
});
