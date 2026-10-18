import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabase } = vi.hoisted(() => ({ supabase: { from: vi.fn() } }));
vi.mock('../../../lib/supabase.ts', () => ({ supabase }));

import { daftarGuruPerencanaan } from './directory.js';

function makeQuery(response) {
  const calls = [];
  const query = {
    calls,
    select: vi.fn((...args) => { calls.push(['select', ...args]); return query; }),
    eq: vi.fn((...args) => { calls.push(['eq', ...args]); return query; }),
    order: vi.fn((...args) => { calls.push(['order', ...args]); return Promise.resolve(response); }),
  };
  return query;
}

describe('Supabase planning teacher directory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns active teachers in a tenant with normalized UI fields', async () => {
    const query = makeQuery({
      data: [
        { id: 'teacher-1', nama: 'Ani', tenant_id: 'school-1' },
        { id: 'teacher-2', nama: null, tenant_id: 'school-1' },
      ],
      error: null,
    });
    supabase.from.mockReturnValueOnce(query);

    await expect(daftarGuruPerencanaan('school-1')).resolves.toEqual([
      { uid: 'teacher-1', nama: 'Ani', tenantId: 'school-1' },
      { uid: 'teacher-2', nama: '', tenantId: 'school-1' },
    ]);
    expect(supabase.from).toHaveBeenCalledWith('profiles');
    expect(query.calls).toContainEqual(['eq', 'role', 'guru']);
    expect(query.calls).toContainEqual(['eq', 'active', true]);
    expect(query.calls).toContainEqual(['eq', 'tenant_id', 'school-1']);
  });

  it('uses the superadmin-visible directory without narrowing by tenant', async () => {
    const query = makeQuery({ data: [], error: null });
    supabase.from.mockReturnValueOnce(query);
    await expect(daftarGuruPerencanaan()).resolves.toEqual([]);
    expect(query.calls.some(([method, field]) => method === 'eq' && field === 'tenant_id')).toBe(false);
  });

  it('surfaces query failures and invalid result shapes', async () => {
    supabase.from.mockReturnValueOnce(makeQuery({ data: null, error: new Error('denied') }));
    await expect(daftarGuruPerencanaan('school-1')).rejects.toThrow('denied');

    supabase.from.mockReturnValueOnce(makeQuery({ data: null, error: null }));
    await expect(daftarGuruPerencanaan('school-1')).rejects.toThrow('direktori guru yang valid');
  });
});
