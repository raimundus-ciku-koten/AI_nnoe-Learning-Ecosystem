import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabase } = vi.hoisted(() => ({ supabase: { from: vi.fn() } }));
vi.mock('../lib/supabase.ts', () => ({ supabase }));

import {
  ambilKunciPublikPengguna,
  daftarAdminKunciTenant,
  simpanKunciPublikPengguna,
} from './encryptionKeyDirectory.js';

function makeQuery(response) {
  const calls = [];
  const query = {
    calls,
    select: vi.fn((...args) => { calls.push(['select', ...args]); return query; }),
    eq: vi.fn((...args) => { calls.push(['eq', ...args]); return query; }),
    order: vi.fn((...args) => { calls.push(['order', ...args]); return Promise.resolve(response); }),
    maybeSingle: vi.fn(() => Promise.resolve(response)),
    upsert: vi.fn((...args) => { calls.push(['upsert', ...args]); return Promise.resolve(response); }),
  };
  return query;
}

describe('planning encryption key directory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists active school admins only in the requested tenant', async () => {
    const query = makeQuery({ data: [{ id: 'admin-1', email: 'admin@example.test' }], error: null });
    supabase.from.mockReturnValueOnce(query);

    await expect(daftarAdminKunciTenant('school-1')).resolves.toHaveLength(1);
    expect(supabase.from).toHaveBeenCalledWith('profiles');
    expect(query.calls).toContainEqual(['eq', 'tenant_id', 'school-1']);
    expect(query.calls).toContainEqual(['eq', 'role', 'admin_sekolah']);
    expect(query.calls).toContainEqual(['eq', 'active', true]);
  });

  it('requires an active same-tenant admin and a valid registered key', async () => {
    const profileQuery = makeQuery({
      data: { id: 'admin-1', email: 'admin@example.test' },
      error: null,
    });
    const keyQuery = makeQuery({
      data: {
        public_key: 'encoded-public-key',
        fingerprint: 'c'.repeat(64),
        key_version: 2,
      },
      error: null,
    });
    supabase.from.mockReturnValueOnce(profileQuery).mockReturnValueOnce(keyQuery);

    await expect(ambilKunciPublikPengguna('admin-1', 'school-1')).resolves.toEqual({
      userId: 'admin-1',
      email: 'admin@example.test',
      publicKey: 'encoded-public-key',
      fingerprint: 'c'.repeat(64),
      keyVersion: 2,
    });
    expect(profileQuery.calls).toContainEqual(['eq', 'tenant_id', 'school-1']);
    expect(profileQuery.calls).toContainEqual(['eq', 'role', 'admin_sekolah']);
    expect(keyQuery.calls).toContainEqual(['eq', 'user_id', 'admin-1']);
  });

  it('surfaces Supabase errors and does not silently accept missing keys', async () => {
    supabase.from.mockReturnValueOnce(makeQuery({
      data: null,
      error: new Error('permission denied'),
    }));
    await expect(daftarAdminKunciTenant('school-1')).rejects.toThrow('permission denied');

    supabase.from.mockReturnValueOnce(makeQuery({
      data: { id: 'admin-1', email: 'admin@example.test' },
      error: null,
    })).mockReturnValueOnce(makeQuery({ data: null, error: null }));
    await expect(ambilKunciPublikPengguna('admin-1', 'school-1'))
      .rejects.toThrow('belum menyiapkan kunci publik');
  });

  it('registers key fingerprints against the authenticated user row', async () => {
    const query = makeQuery({ error: null });
    supabase.from.mockReturnValueOnce(query);
    const identity = {
      publicKey: 'encoded-public-key',
      fingerprint: 'd'.repeat(64),
      keyVersion: 1,
    };

    await expect(simpanKunciPublikPengguna('teacher-1', identity)).resolves.toBeUndefined();
    expect(supabase.from).toHaveBeenCalledWith('user_encryption_keys');
    expect(query.calls[0][1]).toMatchObject({
      user_id: 'teacher-1',
      fingerprint: identity.fingerprint,
      key_version: 1,
    });
  });
});
