import assert from 'node:assert/strict';
import test from 'node:test';
import { isGoogleSignInVisible } from './loginOptions.js';

test('Google sign-in remains visible by default', () => {
  assert.equal(isGoogleSignInVisible(undefined), true);
  assert.equal(isGoogleSignInVisible(''), true);
  assert.equal(isGoogleSignInVisible('true'), true);
});

test('Google sign-in can be hidden explicitly in an environment', () => {
  assert.equal(isGoogleSignInVisible('false'), false);
  assert.equal(isGoogleSignInVisible(' FALSE '), false);
});
