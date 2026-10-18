import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabase } = vi.hoisted(() => ({
  supabase: { from: vi.fn(), functions: { invoke: vi.fn() } },
}));
vi.mock('../lib/supabase.ts', () => ({ supabase }));

import {
  mulaiCheckoutMidtrans,
  muatLanggananPersonal,
  muatLanggananTenant,
} from './subscriptions.js';

function makeQuery(response) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(() => Promise.resolve(response)),
  };
  return query;
}

describe('Supabase tenant subscription status', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads and maps a tenant entitlement', async () => {
    const query = makeQuery({
      data: { plan_id: 'school-standard', status: 'active', valid_until: '2026-12-31T00:00:00Z' },
      error: null,
    });
    supabase.from.mockReturnValueOnce(query);

    await expect(muatLanggananTenant('school-1')).resolves.toEqual({
      paketId: 'school-standard',
      status: 'active',
      aktif: true,
      sampai: new Date('2026-12-31T00:00:00Z'),
    });
    expect(supabase.from).toHaveBeenCalledWith('tenant_entitlements');
    expect(query.eq).toHaveBeenCalledWith('tenant_id', 'school-1');
  });

  it('returns no entitlement when no row exists and rejects missing tenant IDs', async () => {
    supabase.from.mockReturnValueOnce(makeQuery({ data: null, error: null }));
    await expect(muatLanggananTenant('school-1')).resolves.toBeNull();
    await expect(muatLanggananTenant('')).rejects.toThrow('tenant yang valid');
  });

  it('surfaces query and malformed row errors', async () => {
    supabase.from.mockReturnValueOnce(makeQuery({ data: null, error: new Error('denied') }));
    await expect(muatLanggananTenant('school-1')).rejects.toThrow('denied');

    supabase.from.mockReturnValueOnce(makeQuery({
      data: { plan_id: 'school-standard', status: 'unknown', valid_until: null },
      error: null,
    }));
    await expect(muatLanggananTenant('school-1')).rejects.toThrow('tidak valid');
  });
});

describe('Supabase entitlement status and disabled checkout', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads a personal entitlement and validates the user ID', async () => {
    const query = makeQuery({
      data: { plan_id: 'siswa-basic', status: 'active', valid_until: '2027-02-01T00:00:00Z' },
      error: null,
    });
    supabase.from.mockReturnValueOnce(query);

    await expect(muatLanggananPersonal('user-1')).resolves.toEqual({
      paketId: 'siswa-basic',
      status: 'active',
      aktif: true,
      sampai: new Date('2027-02-01T00:00:00Z'),
    });
    expect(supabase.from).toHaveBeenCalledWith('personal_entitlements');
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    await expect(muatLanggananPersonal('')).rejects.toThrow('Akun pengguna');
  });

  it('blocks checkout without calling the backend', async () => {
    await expect(mulaiCheckoutMidtrans('siswa-basic', 'bulanan'))
      .rejects.toThrow('Checkout dinonaktifkan');
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });
});
