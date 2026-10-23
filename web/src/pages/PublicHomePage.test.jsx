import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PublicHomePage from './PublicHomePage.jsx';

describe('PublicHomePage', () => {
  it('introduces the learning ecosystem and links existing users to sign in', () => {
    const html = renderToStaticMarkup(React.createElement(PublicHomePage));

    expect(html).toContain('Lebih terarah dalam setiap perjalanan belajar.');
    expect(html).toContain('href="#/login"');
    expect(html).toContain('Perencanaan');
    expect(html).toContain('Asesmen');
    expect(html).toContain('Informasi privasi');
  });

  it('does not advertise public registration, purchasing, or unverified availability', () => {
    const html = renderToStaticMarkup(React.createElement(PublicHomePage));

    expect(html).not.toMatch(/daftar gratis|buat akun|beli sekarang|checkout/i);
    expect(html).toContain('Akses aplikasi diberikan melalui akun yang disediakan administrator sekolah.');
    expect(html).toContain('Fitur dan data yang dapat digunakan bergantung pada aktivasi');
  });
});
