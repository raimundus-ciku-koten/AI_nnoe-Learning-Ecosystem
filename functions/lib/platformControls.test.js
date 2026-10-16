'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PlatformControlError,
  createPlatformControlService,
  parseControlRequest,
} = require('./platformControls');

function fakeFirestore(initial = {}) {
  const documents = new Map(Object.entries(initial));
  const db = {
    doc: (path) => ({ path, get: async () => snapshot(path) }),
    runTransaction: async (callback) => callback({
      get: async (ref) => snapshot(ref.path),
      set: (ref, data) => documents.set(ref.path, data),
      create: (ref, data) => {
        if (documents.has(ref.path)) throw new Error('already-exists');
        documents.set(ref.path, data);
      },
    }),
  };
  function snapshot(path) {
    return {
      exists: documents.has(path),
      data: () => documents.get(path),
    };
  }
  return { db, documents };
}

const fieldValue = { serverTimestamp: () => 'SERVER_TIME' };

test('validates only known control settings and exact payload fields', () => {
  assert.deepEqual(parseControlRequest({ setting: 'maintenance', enabled: true }), {
    setting: 'maintenance', enabled: true,
  });
  assert.deepEqual(parseControlRequest({
    setting: 'feature', feature: 'aiAssistant', enabled: false,
  }), { setting: 'feature', feature: 'aiAssistant', enabled: false });

  for (const invalid of [
    null,
    { setting: 'maintenance', enabled: 'true' },
    { setting: 'feature', feature: 'unknownFeature', enabled: true },
    { setting: 'maintenance', enabled: true, actorUid: 'forged' },
    { setting: 'feature', feature: 'aiAssistant', enabled: true, extra: true },
  ]) {
    assert.throws(() => parseControlRequest(invalid), PlatformControlError);
  }
});

test('updates maintenance and public runtime state atomically with an immutable audit record', async () => {
  const { db, documents } = fakeFirestore();
  const service = createPlatformControlService({
    db, fieldValue, randomUUID: () => 'audit-maintenance-1',
  });

  const result = await service.setControl('super-1', {
    setting: 'maintenance',
    enabled: true,
  });

  assert.deepEqual(result, {
    changed: true,
    state: { maintenance: true, features: { aiAssistant: true, aiGeneration: true } },
  });
  assert.deepEqual(documents.get('publicConfig/platform'), {
    maintenance: true,
    features: { aiAssistant: true, aiGeneration: true },
    updatedAt: 'SERVER_TIME',
  });
  assert.deepEqual(documents.get('platform/controlState'), {
    maintenance: true,
    features: { aiAssistant: true, aiGeneration: true },
    updatedAt: 'SERVER_TIME',
    updatedBy: 'super-1',
  });
  assert.deepEqual(documents.get('platformAudit/audit-maintenance-1'), {
    actorUid: 'super-1',
    action: 'platform.control.updated',
    target: 'maintenance',
    before: false,
    after: true,
    createdAt: 'SERVER_TIME',
  });
  assert.equal(await service.isMaintenanceEnabled(), true);
});

test('changes AI flags used by backend checks and does not write audit for no-op updates', async () => {
  const { db, documents } = fakeFirestore();
  let auditNumber = 0;
  const service = createPlatformControlService({
    db,
    fieldValue,
    randomUUID: () => `audit-${++auditNumber}`,
  });

  assert.equal(await service.isFeatureEnabled('aiGeneration'), true);
  const changed = await service.setControl('super-1', {
    setting: 'feature', feature: 'aiGeneration', enabled: false,
  });
  assert.equal(changed.changed, true);
  assert.equal(await service.isFeatureEnabled('aiGeneration'), false);
  assert.deepEqual(documents.get('publicConfig/platform').features, {
    aiAssistant: true,
    aiGeneration: false,
  });

  const unchanged = await service.setControl('super-1', {
    setting: 'feature', feature: 'aiGeneration', enabled: false,
  });
  assert.equal(unchanged.changed, false);
  assert.equal(documents.has('platformAudit/audit-2'), false);
});

test('repairs a missing public runtime document without emitting a change audit', async () => {
  const { db, documents } = fakeFirestore({
    'platform/controlState': {
      maintenance: true,
      features: { aiAssistant: false, aiGeneration: true },
      updatedBy: 'super-1',
    },
  });
  const service = createPlatformControlService({ db, fieldValue, randomUUID: () => 'audit-repair' });

  const result = await service.setControl('super-1', {
    setting: 'maintenance', enabled: true,
  });

  assert.equal(result.changed, false);
  assert.deepEqual(documents.get('publicConfig/platform'), {
    maintenance: true,
    features: { aiAssistant: false, aiGeneration: true },
    updatedAt: 'SERVER_TIME',
  });
  assert.equal(documents.has('platformAudit/audit-repair'), false);
});

test('requires a trusted actor identifier', async () => {
  const { db } = fakeFirestore();
  const service = createPlatformControlService({ db, fieldValue, randomUUID: () => 'audit-1' });
  await assert.rejects(
    service.setControl('', { setting: 'maintenance', enabled: false }),
    (error) => error.code === 'unauthenticated',
  );
});
