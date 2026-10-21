import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabase } = vi.hoisted(() => ({ supabase: { from: vi.fn() } }));
vi.mock('../lib/supabase.ts', () => ({ supabase }));

import { muatPenugasanGuru } from './teacherAssignments.js';

function makeQuery(response) {
  const calls = [];
  const query = {
    calls,
    select: vi.fn((...args) => { calls.push(['select', ...args]); return query; }),
    eq: vi.fn((...args) => { calls.push(['eq', ...args]); return query; }),
    maybeSingle: vi.fn(() => Promise.resolve(response)),
  };
  return query;
}

describe('Supabase teacher assignment reader', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads only the user profile assignment arrays and normalizes them', async () => {
    const query = makeQuery({
      data: {
        mapel_ids: [' Matematika ', 'Bahasa Indonesia', 'Matematika', null],
        kelas_ids: ['10A', '7A', '10A'],
      },
      error: null,
    });
    supabase.from.mockReturnValueOnce(query);

    await expect(muatPenugasanGuru('user-1')).resolves.toEqual({
      mapel: ['Bahasa Indonesia', 'Matematika'],
      kelas: ['7A', '10A'],
    });
    expect(supabase.from).toHaveBeenCalledWith('profiles');
    expect(query.select).toHaveBeenCalledWith('mapel_ids,kelas_ids');
    expect(query.eq).toHaveBeenCalledWith('id', 'user-1');
  });

  it('rejects missing identities, query failures, and absent profiles', async () => {
    await expect(muatPenugasanGuru('')).rejects.toThrow('ID pengguna wajib diisi');

    supabase.from.mockReturnValueOnce(makeQuery({ data: null, error: new Error('RLS denied') }));
    await expect(muatPenugasanGuru('user-1')).rejects.toThrow('RLS denied');

    supabase.from.mockReturnValueOnce(makeQuery({ data: null, error: null }));
    await expect(muatPenugasanGuru('user-1')).rejects.toThrow('Penugasan pengguna tidak ditemukan');
  });
});
