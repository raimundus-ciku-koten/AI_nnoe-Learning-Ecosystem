import assert from 'node:assert/strict';
import test from 'node:test';
import { isGoogleSignInVisible } from './loginOptions.js';

test('Google sign-in is hidden unless explicitly enabled', () => {
  assert.equal(isGoogleSignInVisible(undefined), false);
  assert.equal(isGoogleSignInVisible(''), false);
  assert.equal(isGoogleSignInVisible('yes'), false);
  assert.equal(isGoogleSignInVisible('false'), false);
});

test('Google sign-in is visible only when explicitly enabled', () => {
  assert.equal(isGoogleSignInVisible('true'), true);
  assert.equal(isGoogleSignInVisible(' TRUE '), true);
});
