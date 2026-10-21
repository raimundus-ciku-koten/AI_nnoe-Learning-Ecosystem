'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const functions = require('../index');

test('registers the superadmin platform-control callable at module scope', () => {
  assert.equal(typeof functions.setPlatformControl, 'function');
  assert.deepEqual(functions.setPlatformControl.__endpoint.region, ['asia-southeast2']);
});

test('rejects unauthenticated and non-superadmin callers before touching control data', async () => {
  await assert.rejects(
    functions.setPlatformControl.run({ auth: null, data: { setting: 'maintenance', enabled: true } }),
    (error) => error.code === 'unauthenticated',
  );
  await assert.rejects(
    functions.setPlatformControl.run({
      auth: { uid: 'guru-1', token: { role: 'guru' } },
      data: { setting: 'maintenance', enabled: true },
    }),
    (error) => error.code === 'permission-denied',
  );
});

test('registers the superadmin account-provisioning callable', () => {
  assert.equal(typeof functions.createPlatformUser, 'function');
  assert.deepEqual(functions.createPlatformUser.__endpoint.region, ['asia-southeast2']);
});

test('rejects unauthenticated and non-superadmin account creation requests', async () => {
  const data = {
    nama: 'Guru Baru',
    email: 'guru@example.id',
    role: 'guru',
    tenantId: 'sekolah-a',
  };
  await assert.rejects(
    functions.createPlatformUser.run({ auth: null, data }),
    (error) => error.code === 'unauthenticated',
  );
  await assert.rejects(
    functions.createPlatformUser.run({
      auth: { uid: 'guru-1', token: { role: 'guru', tenantId: 'sekolah-a' } },
      data,
    }),
    (error) => error.code === 'permission-denied',
  );
});
