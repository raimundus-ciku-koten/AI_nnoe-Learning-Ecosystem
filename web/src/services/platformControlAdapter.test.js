import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlatformControlAdapter } from './platformControlAdapter.js';

const currentState = {
  maintenance: false,
  features: { aiAssistant: true, aiGeneration: false },
};

const makeClient = ({ row, rpcResult, readError, rpcError } = {}) => {
  const calls = [];
  const client = {
    from(table) {
      calls.push(['from', table]);
      const query = {
        select(columns) {
          calls.push(['select', columns]);
          return query;
        },
        eq(column, value) {
          calls.push(['eq', column, value]);
          return query;
        },
        async maybeSingle() {
          return { data: row ?? null, error: readError ?? null };
        },
      };
      return query;
    },
    async rpc(name, args) {
      calls.push(['rpc', name, args]);
      return { data: rpcResult ?? null, error: rpcError ?? null };
    },
  };
  return { client, calls };
};

test('reads and validates the global control row', async () => {
  const { client, calls } = makeClient({
    row: {
      id: 'global',
      ...currentState,
      updated_by: null,
      updated_at: '2026-01-01T00:00:00Z',
    },
  });
  const state = await createPlatformControlAdapter(client).getState();

  assert.deepEqual(state, {
    ...currentState,
    updatedBy: null,
    updatedAt: '2026-01-01T00:00:00Z',
  });
  assert.deepEqual(calls.slice(0, 3), [
    ['from', 'platform_control'],
    ['select', 'id, maintenance, features, updated_by, updated_at'],
    ['eq', 'id', 'global'],
  ]);
});

test('uses the protected Supabase RPC for valid updates', async () => {
  const { client, calls } = makeClient({
    rpcResult: { changed: true, state: currentState },
  });
  const result = await createPlatformControlAdapter(client).setControl({
    setting: 'feature',
    feature: 'aiGeneration',
    enabled: false,
  });

  assert.deepEqual(result, { changed: true, state: currentState });
  assert.deepEqual(calls, [[
    'rpc',
    'set_platform_control',
    { p_setting: 'feature', p_enabled: false, p_feature: 'aiGeneration' },
  ]]);
});

test('rejects malformed requests and response state', async () => {
  const { client, calls } = makeClient({
    rpcResult: { changed: true, state: { maintenance: false, features: { unknown: true } } },
  });
  const adapter = createPlatformControlAdapter(client);
  await assert.rejects(
    adapter.setControl({ setting: 'feature', feature: 'unknown', enabled: true }),
    /tidak dikenal/,
  );
  assert.equal(calls.length, 0);
  await assert.rejects(
    adapter.setControl({}),
    /tidak dikenal/,
  );
  await assert.rejects(
    adapter.setControl({ setting: 'maintenance', enabled: true }),
    /fitur kontrol platform tidak valid/,
  );
});

test('surfaces Supabase read/write errors and missing global config', async () => {
  const readFailure = createPlatformControlAdapter(makeClient({ readError: new Error('read failed') }).client);
  await assert.rejects(readFailure.getState(), /Gagal memuat kontrol platform/);

  const missing = createPlatformControlAdapter(makeClient().client);
  await assert.rejects(missing.getState(), /belum dikonfigurasi/);

  const writeFailure = createPlatformControlAdapter(makeClient({
    rpcError: new Error('write failed'),
  }).client);
  await assert.rejects(
    writeFailure.setControl({ setting: 'maintenance', enabled: true }),
    /Gagal mengubah kontrol platform/,
  );
});
