'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  encryptSecret, decryptSecret, keyRing, validateApiKey,
  validateWorkflowPreference, resolveUserConfig, connectionStatus
} = require('../lib/aiUserSettings');

const makeRing = (version = 'v1', byte = 1) => JSON.stringify({
  active: version,
  keys: { [version]: Buffer.alloc(32, byte).toString('base64') }
});

test('encrypts credentials with authenticated encryption and supports retained key versions', () => {
  const ring = JSON.stringify({
    active: 'v2',
    keys: {
      v1: Buffer.alloc(32, 1).toString('base64'),
      v2: Buffer.alloc(32, 2).toString('base64')
    }
  });
  const encrypted = encryptSecret('private-api-key', ring);
  assert.equal(encrypted.version, 'v2');
  assert.notEqual(encrypted.data, 'private-api-key');
  assert.equal(decryptSecret(encrypted, ring), 'private-api-key');
  assert.throws(() => decryptSecret({ ...encrypted, data: Buffer.from('tampered').toString('base64') }, ring));
  assert.throws(() => decryptSecret(encrypted, makeRing('v3', 3)));
});

test('rejects malformed encryption keyrings and provider key inputs', () => {
  assert.throws(() => keyRing('not-json'));
  assert.throws(() => keyRing(JSON.stringify({ active: 'v1', keys: { v1: 'abc' } })));
  for (const key of ['', 'too short', 'contains space', 'x'.repeat(4097)]) {
    assert.throws(() => validateApiKey('gemini', key));
  }
  assert.throws(() => validateApiKey('claude', 'a-valid-looking-key'));
  assert.doesNotThrow(() => validateApiKey('deepseek', 'a-valid-key-123'));
});

test('validates workflow preferences and merges personal keys over platform defaults', () => {
  assert.doesNotThrow(() => validateWorkflowPreference('questions', 'deepseek'));
  assert.throws(() => validateWorkflowPreference('invalid', 'gemini'));
  const ring = makeRing();
  const settings = {
    credentials: {
      gemini: encryptSecret('personal-gemini', ring, 'teacher-1:gemini'),
      groq: encryptSecret('personal-groq', ring, 'teacher-1:groq')
    },
    preferences: { questions: 'groq' }
  };
  const resolved = resolveUserConfig(settings, ring, {
    geminiKeys: ['platform-gemini'],
    deepseekKey: 'platform-deepseek',
    groqKey: '',
    cerebrasKey: 'platform-cerebras'
  }, 'teacher-1');
  assert.deepEqual(resolved.geminiKeys, ['personal-gemini']);
  assert.equal(resolved.deepseekKey, 'platform-deepseek');
  assert.equal(resolved.groqKey, 'personal-groq');
  assert.equal(resolved.cerebrasKey, 'platform-cerebras');
  assert.equal(resolved.preferences.questions, 'groq');
  assert.equal(resolveUserConfig({ usePersonalKeys: false, credentials: settings.credentials }, ring, {
    geminiKeys: ['platform-gemini'],
    deepseekKey: '',
    groqKey: '',
    cerebrasKey: 'platform-cerebras'
  }, 'teacher-1').geminiKeys[0], 'platform-gemini');
});

test('connection status does not return credentials and leaves Claude unavailable', () => {
  const status = connectionStatus({
    credentials: { gemini: { data: 'ciphertext' } },
    preferences: { planning: 'claude' }
  }, { geminiKeys: [], deepseekKey: '', groqKey: '', cerebrasKey: '' });
  assert.equal(status.providers.gemini.available, true);
  assert.equal(status.providers.groq.available, false);
  assert.equal(status.providers.claude.available, false);
  assert.equal(status.preferences.planning, 'auto');
  assert.equal(JSON.stringify(status).includes('ciphertext'), false);
});
