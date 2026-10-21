'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PlatformUserError,
  createPlatformUserService,
  parseCreateUserRequest,
} = require('./platformUsers');

const fieldValue = { serverTimestamp: () => 'SERVER_TIME' };
const request = {
  nama: '  Guru Baru  ',
  email: '  guru@example.id ',
  role: 'guru',
  tenantId: 'sekolah-a',
};

function fakeServices({ commitError, userCreateError, deleteUserError } = {}) {
  const documents = new Map([['tenants/sekolah-a', { nama: 'Sekolah A' }]]);
  const accounts = new Map();
  const claims = new Map();
  const auth = {
    createUser: async (data) => {
      if (userCreateError) throw userCreateError;
      const user = { ...data, uid: 'user-1' };
      accounts.set(user.uid, user);
      return user;
    },
    setCustomUserClaims: async (uid, value) => claims.set(uid, value),
    updateUser: async (uid, value) => accounts.set(uid, { ...accounts.get(uid), ...value }),
    deleteUser: async (uid) => {
      if (deleteUserError) throw deleteUserError;
      accounts.delete(uid);
    },
  };
  const db = {
    doc: (path) => ({
      path,
      get: async () => ({
        exists: documents.has(path),
        data: () => documents.get(path),
      }),
    }),
    batch: () => {
      const pending = [];
      return {
        set: (ref, data) => pending.push(['set', ref.path, data]),
        create: (ref, data) => pending.push(['create', ref.path, data]),
        commit: async () => {
          if (commitError) throw commitError;
          for (const [, path] of pending) {
            if (path.startsWith('platformAudit/') && documents.has(path)) {
              throw new Error('audit id collision');
            }
          }
          for (const [, path, data] of pending) documents.set(path, data);
        },
      };
    },
  };
  return { auth, db, documents, accounts, claims };
}

test('validates exact account fields and canonical roles', () => {
  assert.deepEqual(parseCreateUserRequest(request), {
    nama: 'Guru Baru',
    email: 'guru@example.id',
    role: 'guru',
    tenantId: 'sekolah-a',
  });

  test('capitalizes name initials without removing entered titles', () => {
    assert.deepEqual(parseCreateUserRequest({
      ...request,
      nama: '  maria de-souza, s.pd.  ',
    }), {
      nama: 'Maria De-Souza, S.pd.',
      email: 'guru@example.id',
      role: 'guru',
      tenantId: 'sekolah-a',
    });
  });
  for (const invalid of [
    { ...request, role: 'superadmin' },
    { ...request, email: 'not-an-email' },
    { ...request, tenantId: 'school/a' },
    { ...request, extra: true },
    { ...request, nama: ' ' },
  ]) {
    assert.throws(() => parseCreateUserRequest(invalid), PlatformUserError);
  }
});

test('creates Auth user, role claims, profile, directory and immutable audit record', async () => {
  const services = fakeServices();
  const service = createPlatformUserService({
    ...services,
    fieldValue,
    randomUUID: () => 'audit-1',
  });

  const result = await service.create('super-1', request);

  assert.deepEqual(result, {
    uid: 'user-1',
    email: 'guru@example.id',
    role: 'guru',
    tenantId: 'sekolah-a',
  });
  assert.equal(services.accounts.get('user-1').emailVerified, false);
  assert.deepEqual(services.claims.get('user-1'), { role: 'guru', tenantId: 'sekolah-a' });
  assert.deepEqual(services.documents.get('users/user-1'), {
    nama: 'Guru Baru',
    email: 'guru@example.id',
    role: 'guru',
    tenantId: 'sekolah-a',
    aktif: true,
    dibuat: 'SERVER_TIME',
  });
  assert.deepEqual(services.documents.get('directory/user-1'), {
    uid: 'user-1',
    nama: 'Guru Baru',
    role: 'guru',
    tenantId: 'sekolah-a',
    updatedAt: 'SERVER_TIME',
  });
  assert.deepEqual(services.documents.get('platformAudit/audit-1'), {
    actorUid: 'super-1',
    action: 'platform.user.created',
    target: 'user-1',
    role: 'guru',
    tenantId: 'sekolah-a',
    createdAt: 'SERVER_TIME',
  });
});

test('rejects missing tenants before creating any Auth account', async () => {
  const services = fakeServices();
  const service = createPlatformUserService({
    ...services,
    fieldValue,
    randomUUID: () => 'audit-1',
  });

  await assert.rejects(
    service.create('super-1', { ...request, tenantId: 'missing-school' }),
    (error) => error.code === 'not-found',
  );
  assert.equal(services.accounts.size, 0);
});

test('rolls back the Auth user if profile and audit commit fails', async () => {
  const services = fakeServices({ commitError: new Error('Firestore unavailable') });
  const service = createPlatformUserService({
    ...services,
    fieldValue,
    randomUUID: () => 'audit-1',
  });

  await assert.rejects(service.create('super-1', request), /Firestore unavailable/);
  assert.equal(services.accounts.size, 0);
});

test('disables the account and removes its role claims if rollback deletion fails', async () => {
  const cleanupErrors = [];
  const services = fakeServices({
    commitError: new Error('Firestore unavailable'),
    deleteUserError: new Error('Auth unavailable'),
  });
  const service = createPlatformUserService({
    ...services,
    fieldValue,
    randomUUID: () => 'audit-1',
    onCleanupError: (error) => cleanupErrors.push(error),
  });

  await assert.rejects(service.create('super-1', request), /Firestore unavailable/);
  assert.equal(services.accounts.get('user-1').disabled, true);
  assert.deepEqual(services.claims.get('user-1'), {});
  assert.equal(cleanupErrors.length, 1);
});

test('translates duplicate email errors without creating a profile', async () => {
  const services = fakeServices({
    userCreateError: Object.assign(new Error('already used'), { code: 'auth/email-already-exists' }),
  });
  const service = createPlatformUserService({
    ...services,
    fieldValue,
    randomUUID: () => 'audit-1',
  });

  await assert.rejects(
    service.create('super-1', request),
    (error) => error.code === 'already-exists',
  );
  assert.equal(services.documents.has('users/user-1'), false);
});
