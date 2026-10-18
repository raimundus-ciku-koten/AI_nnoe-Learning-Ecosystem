import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileWebPushSubscriptions } from '../../scripts/reconcileWebPushSubscriptions.mjs';

const baseInput = {
  legacyTokens: [
    {
      legacyUid: 'firebase-user-1',
      tokenKey: 'opaque-fcm-registration-token',
      token: 'opaque-fcm-registration-token',
    },
  ],
  reconciledAt: '2026-01-01T00:00:00Z',
};

test('quarantines FCM tokens instead of treating them as Web Push subscriptions', () => {
  const report = reconcileWebPushSubscriptions(baseInput);
  assert.equal(report.mode, 'report-only');
  assert.deepEqual(report.summary, {
    sourceTokens: 1,
    quarantined: 1,
    proposals: 0,
  });
  assert.deepEqual(report.proposals, []);
  assert.deepEqual(report.quarantined[0], {
    sourceIndex: 0,
    reason: 'source_fcm_token_not_web_push_subscription',
  });
  assert.equal(JSON.stringify(report).includes('opaque-fcm-registration-token'), false);
  assert.equal(JSON.stringify(report).includes('firebase-user-1'), false);
});

test('quarantines malformed source token records without exposing their values', () => {
  const report = reconcileWebPushSubscriptions({
    ...baseInput,
    legacyTokens: [
      { legacyUid: 'user-2', tokenKey: '', token: '' },
      { token: 'value-without-owner' },
      { legacyUid: 'user-3', tokenKey: 'wrong-key', token: 'some-token' },
      { legacyUid: 'user-4', tokenKey: 'ab_c', token: 'ab.c' },
    ],
  });
  assert.deepEqual(
    report.quarantined.map(({ reason }) => reason),
    [
      'source_fcm_token_invalid',
      'source_fcm_token_record_invalid',
      'source_fcm_token_key_invalid',
      'source_fcm_token_not_web_push_subscription',
    ],
  );
  assert.equal(JSON.stringify(report).includes('value-without-owner'), false);
});

test('validates source input containers and reconciliation time', () => {
  assert.throws(() => reconcileWebPushSubscriptions({}), /legacyTokens must be an array/);
  assert.throws(
    () => reconcileWebPushSubscriptions({ ...baseInput, reconciledAt: 'invalid' }),
    /reconciledAt must be an ISO timestamp/,
  );
});
