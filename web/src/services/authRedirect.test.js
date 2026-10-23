import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthRedirectUrl } from './authRedirect.js';

test('OAuth redirect returns to the login route on the current origin', () => {
  assert.equal(
    createAuthRedirectUrl({
      origin: 'https://preview.example.test',
      pathname: '/',
    }),
    'https://preview.example.test/#/login',
  );
});

test('password setup parameters are preserved before the login hash route', () => {
  assert.equal(
    createAuthRedirectUrl({
      origin: 'https://preview.example.test',
      pathname: '/app',
    }, { 'setup-password': '1' }),
    'https://preview.example.test/app?setup-password=1#/login',
  );
});
