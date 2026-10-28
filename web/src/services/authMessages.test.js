import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pesanLogin } from './authMessages.js';

test('login explains when the Turnstile token is not ready', () => {
  assert.match(pesanLogin({ code: 'captcha_token_missing' }), /Tunggu.*Cloudflare siap/);
});

test('login explains when Turnstile setup fails', () => {
  assert.match(pesanLogin({ code: 'captcha_setup_failed' }), /tidak dapat dimuat/);
});

test('login explains Turnstile widget failures without exposing arbitrary provider values', () => {
  assert.equal(
    pesanLogin({ code: 'captcha_widget_error', providerCode: '110200' }),
    'Cloudflare mengalami kendala saat menampilkan pemeriksaan. Periksa konfigurasi domain widget atau coba browser/jaringan lain. (kode: 110200)',
  );
  assert.doesNotMatch(
    pesanLogin({ code: 'captcha_widget_error', providerCode: 'secret-value' }),
    /secret-value/,
  );
});

test('login preserves existing auth errors and safe fallback messaging', () => {
  assert.equal(
    pesanLogin({ code: 'invalid_credentials' }),
    'Email atau kata sandi tidak sesuai. (kode: invalid_credentials)',
  );
  assert.match(pesanLogin({}), /^Tidak dapat masuk saat ini/);
});

test('Google login retains its provider-specific fallback', () => {
  assert.match(pesanLogin({}, true), /provider Google/);
});
