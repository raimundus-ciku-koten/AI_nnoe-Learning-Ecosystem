import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state = {
    data: { endpoint: 'https://push.example/device' },
    error: null,
    subscription: {
      endpoint: 'https://push.example/device',
      unsubscribe: vi.fn(async () => true),
    },
  };
  const query = {};
  for (const method of ['select', 'delete', 'eq']) {
    query[method] = vi.fn(() => query);
  }
  query.maybeSingle = vi.fn(async () => ({ data: state.data, error: state.error }));
  query.then = (resolve, reject) => Promise.resolve({ error: state.error }).then(resolve, reject);
  return { state, query, from: vi.fn(() => query) };
});

vi.mock('../lib/supabase.ts', () => ({ supabase: { from: mocks.from } }));
vi.mock('../config.js', () => ({ WEB_PUSH_PUBLIC_KEY: 'public-vapid-key' }));

import { lepaskanPerangkat, muatStatusNotifikasi, statusNotifikasi } from './messaging.js';

describe('messaging notification preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.data = { endpoint: 'https://push.example/device' };
    mocks.state.error = null;
    mocks.state.subscription = {
      endpoint: 'https://push.example/device',
      unsubscribe: vi.fn(async () => true),
    };
    vi.stubGlobal('Notification', { permission: 'granted' });
    vi.stubGlobal('window', { PushManager: function PushManager() {} });
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistration: vi.fn(async () => ({
          pushManager: {
            getSubscription: vi.fn(async () => mocks.state.subscription),
          },
        })),
      },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('reports unsupported browsers distinctly from denied notification permission', async () => {
    vi.stubGlobal('Notification', undefined);
    expect(statusNotifikasi()).toBe('unsupported');
    await expect(muatStatusNotifikasi('user-1')).resolves.toEqual({
      supported: false,
      configured: true,
      permission: 'unsupported',
      subscribed: false,
    });
  });

  it('confirms a device subscription only when it is registered for the current account', async () => {
    await expect(muatStatusNotifikasi('user-1')).resolves.toEqual({
      supported: true,
      configured: true,
      permission: 'granted',
      subscribed: true,
    });
    expect(mocks.from).toHaveBeenCalledWith('web_push_subscriptions');
    expect(mocks.query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(mocks.query.eq).toHaveBeenCalledWith('endpoint', 'https://push.example/device');

    mocks.state.data = null;
    await expect(muatStatusNotifikasi('user-1')).resolves.toMatchObject({ subscribed: false });
  });

  it('surfaces server errors while checking the saved device subscription', async () => {
    mocks.state.error = new Error('RLS denied');
    await expect(muatStatusNotifikasi('user-1')).rejects.toThrow('RLS denied');
  });

  it('removes the account-device registration before unsubscribing from browser push', async () => {
    await lepaskanPerangkat('user-1');
    expect(mocks.from).toHaveBeenCalledWith('web_push_subscriptions');
    expect(mocks.query.delete).toHaveBeenCalledOnce();
    expect(mocks.query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(mocks.query.eq).toHaveBeenCalledWith('endpoint', 'https://push.example/device');
    expect(mocks.state.subscription.unsubscribe).toHaveBeenCalledOnce();
  });

  it('does not unsubscribe locally when the server registration could not be deleted', async () => {
    mocks.state.error = new Error('RLS denied');
    await expect(lepaskanPerangkat('user-1')).rejects.toThrow('RLS denied');
    expect(mocks.state.subscription.unsubscribe).not.toHaveBeenCalled();
  });
});
