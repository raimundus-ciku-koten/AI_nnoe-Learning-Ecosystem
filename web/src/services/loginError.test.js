import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buatErrorCaptcha, pesanLogin } from './loginError.js';

test('login error reports an actionable Turnstile code to the user', () => {
  const error = buatErrorCaptcha('Verifikasi Cloudflare gagal (kode 300030). Hubungi administrator situs.');

  assert.equal(error.code, 'captcha_verification_failed');
  assert.equal(pesanLogin(error), 'Verifikasi Cloudflare gagal (kode 300030). Hubungi administrator situs.');
});

test('login error maps known Auth errors without exposing unknown backend messages', () => {
  assert.equal(
    pesanLogin({ code: 'invalid_credentials', message: 'private backend detail' }),
    'Email atau kata sandi tidak sesuai. (kode: invalid_credentials)',
  );
  assert.equal(
    pesanLogin({ code: 'unrecognized', message: 'private backend detail' }),
    'Tidak dapat masuk saat ini. Silakan coba lagi. (kode: unrecognized)',
  );
});

test('Google login retains its existing safe fallback', () => {
  assert.equal(
    pesanLogin({ message: 'provider secret detail' }, true),
    'Login Google gagal. Pastikan provider Google dan URL pengalihan telah dikonfigurasi di Supabase Auth.',
  );
});
