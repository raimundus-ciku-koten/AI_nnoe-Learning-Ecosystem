import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectPrivilegedMfa, totpQrCodeImageSource } from './privilegedMfa.js';

function createMfa({ assurance, factors, assuranceError, factorsError }) {
  return {
    getAuthenticatorAssuranceLevel: async () => ({
      data: assurance,
      error: assuranceError ?? null,
    }),
    listFactors: async () => ({
      data: factors,
      error: factorsError ?? null,
    }),
    enroll: async () => {
      throw new Error('Enrollment must be an explicit user action');
    },
    unenroll: async () => {
      throw new Error('Inspection must never remove a factor');
    },
  };
}

test('grants access without listing factors when the session is already AAL2', async () => {
  const mfa = createMfa({ assurance: { currentLevel: 'aal2' } });
  mfa.listFactors = async () => {
    throw new Error('AAL2 should not need a factor lookup');
  };

  assert.deepEqual(await inspectPrivilegedMfa(mfa), {
    access: true,
    factorId: '',
    enrollmentRequired: false,
    pendingEnrollment: false,
  });
});

test('requires verification for an existing verified TOTP factor', async () => {
  const mfa = createMfa({
    assurance: { currentLevel: 'aal1' },
    factors: { totp: [{ id: 'factor-1', status: 'verified' }] },
  });

  assert.deepEqual(await inspectPrivilegedMfa(mfa), {
    access: false,
    factorId: 'factor-1',
    enrollmentRequired: false,
    pendingEnrollment: false,
  });
});

test('preserves an existing pending TOTP enrollment without removing or replacing it', async () => {
  const mfa = createMfa({
    assurance: { currentLevel: 'aal1' },
    factors: { totp: [{ id: 'pending-factor', status: 'unverified' }] },
  });

  assert.deepEqual(await inspectPrivilegedMfa(mfa), {
    access: false,
    factorId: 'pending-factor',
    enrollmentRequired: false,
    pendingEnrollment: true,
  });
});

test('requests explicit enrollment when no TOTP factors exist', async () => {
  const mfa = createMfa({
    assurance: { currentLevel: 'aal1' },
    factors: { totp: [] },
  });

  assert.deepEqual(await inspectPrivilegedMfa(mfa), {
    access: false,
    factorId: '',
    enrollmentRequired: true,
    pendingEnrollment: false,
  });
});

test('propagates Auth lookup errors without attempting enrollment or removal', async () => {
  const failure = Object.assign(new Error('Auth factors unavailable'), { status: 422 });
  const mfa = createMfa({
    assurance: { currentLevel: 'aal1' },
    factorsError: failure,
  });

  await assert.rejects(inspectPrivilegedMfa(mfa), (error) => error === failure);
});

test('uses Supabase data URI QR codes directly and wraps raw SVG only once', () => {
  const dataUri = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"></svg>';
  const rawSvg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';

  assert.equal(totpQrCodeImageSource(dataUri), dataUri);
  assert.equal(
    totpQrCodeImageSource(rawSvg),
    `data:image/svg+xml;utf-8,${encodeURIComponent(rawSvg)}`,
  );
  assert.equal(totpQrCodeImageSource(''), '');
});
