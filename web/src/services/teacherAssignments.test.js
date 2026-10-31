import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabase } = vi.hoisted(() => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('../lib/supabase.ts', () => ({ supabase }));

import {
  muatGuruTenant,
  muatPenugasanGuru,
  simpanPenugasanGuru,
} from './teacherAssignments.js';

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

function makeListQuery(response) {
  const calls = [];
  const query = {
    calls,
    select: vi.fn((...args) => { calls.push(['select', ...args]); return query; }),
    eq: vi.fn((...args) => { calls.push(['eq', ...args]); return query; }),
    in: vi.fn((...args) => { calls.push(['in', ...args]); return query; }),
    order: vi.fn((...args) => { calls.push(['order', ...args]); return query; }),
    limit: vi.fn((...args) => { calls.push(['limit', ...args]); return Promise.resolve(response); }),
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

  it('loads active specialist teachers from the requested tenant only', async () => {
    const query = makeListQuery({
      data: [{
        id: 'teacher-1',
        nama: 'Guru BK',
        email: 'bk@example.test',
        role: 'guru_bk',
        mapel_ids: ['Bimbingan Konseling'],
        kelas_ids: ['X-A'],
      }], error: null
    });
    supabase.from.mockReturnValueOnce(query);

    await expect(muatGuruTenant('tenant-1')).resolves.toEqual([{
      uid: 'teacher-1',
      nama: 'Guru BK',
      email: 'bk@example.test',
      role: 'guru_bk',
      mapel: ['Bimbingan Konseling'],
      kelas: ['X-A'],
    }]);
    expect(query.calls).toContainEqual(['eq', 'tenant_id', 'tenant-1']);
    expect(query.calls).toContainEqual(['eq', 'active', true]);
    expect(query.calls).toContainEqual(['in', 'role', ['guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler']]);
  });

  it('saves validated teacher assignments through the tenant-scoped RPC', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: { user_id: 'teacher-1' }, error: null });

    await expect(simpanPenugasanGuru({
      userId: 'teacher-1',
      mapel: ['Matematika'],
      kelas: ['X-A', 'X-B'],
    })).resolves.toEqual({ user_id: 'teacher-1' });
    expect(supabase.rpc).toHaveBeenCalledWith('manage_school_teacher_assignments', {
      p_user_id: 'teacher-1',
      p_mapel_ids: ['Matematika'],
      p_kelas_ids: ['X-A', 'X-B'],
    });
  });

  it('rejects invalid and duplicate assignment values before calling the RPC', async () => {
    await expect(simpanPenugasanGuru({
      userId: 'teacher-1', mapel: ['Matematika', 'matematika'], kelas: [],
    })).rejects.toThrow('tidak boleh duplikat');
    await expect(simpanPenugasanGuru({
      userId: 'teacher-1', mapel: [''], kelas: [],
    })).rejects.toThrow('wajib berisi');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
