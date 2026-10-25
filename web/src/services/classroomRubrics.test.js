import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { supabase } = vi.hoisted(() => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock('../lib/supabase.ts', () => ({ supabase }));

import {
  buatRubrikKelas,
  buatVersiRubrikKelas,
  muatRubrikKelas,
} from './classroomRubrics.js';

const input = {
  classroomId: 'class-1',
  title: 'Rubrik Presentasi',
  summary: 'Menilai komunikasi dan pemahaman.',
  criteria: [{
    name: 'Pemahaman',
    levels: {
      '1': 'Belum memahami konsep.',
      '2': 'Memahami sebagian konsep.',
      '3': 'Memahami konsep dengan baik.',
      '4': 'Mampu menjelaskan dan menghubungkan konsep.',
    },
  }],
};

function queryBuilder(result) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

describe('classroom rubric service', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('loads tenant-scoped rubrics and validates newest-first version history', async () => {
    const query = queryBuilder({
      data: [{
        id: 'rubric-1',
        tenant_id: 'tenant-1',
        classroom_id: 'class-1',
        owner_id: 'teacher-1',
        title: 'Rubrik Presentasi',
        created_at: '2026-10-26T08:00:00Z',
        classroom_rubric_versions: [
          {
            id: 'version-2',
            version: 2,
            summary: 'Revisi',
            criteria: input.criteria,
            created_at: '2026-10-27T08:00:00Z',
            created_by: 'teacher-1',
          },
          {
            id: 'version-1',
            version: 1,
            summary: '',
            criteria: input.criteria,
            created_at: '2026-10-26T08:00:00Z',
            created_by: 'teacher-1',
          },
        ],
      }],
      error: null,
    });
    supabase.from.mockReturnValue(query);

    await expect(muatRubrikKelas('tenant-1', 'teacher-1')).resolves.toMatchObject([
      {
        id: 'rubric-1',
        classroomId: 'class-1',
        versi: [{ versi: 2 }, { versi: 1 }],
      },
    ]);
    expect(supabase.from).toHaveBeenCalledWith('classroom_rubrics');
    expect(query.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    expect(query.order).toHaveBeenCalledWith('version', {
      referencedTable: 'classroom_rubric_versions',
      ascending: false,
    });
    expect(query.limit).toHaveBeenCalledWith(20, {
      referencedTable: 'classroom_rubric_versions',
    });
  });

  it('creates a rubric through the server RPC and rejects invalid criteria before sending', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: 'rubric-1', error: null });
    await expect(buatRubrikKelas('tenant-1', 'teacher-1', input))
      .resolves.toBe('rubric-1');
    expect(supabase.rpc).toHaveBeenCalledWith('create_classroom_rubric', {
      p_classroom_id: 'class-1',
      p_title: 'Rubrik Presentasi',
      p_summary: 'Menilai komunikasi dan pemahaman.',
      p_criteria: input.criteria,
    });

    await expect(buatRubrikKelas('tenant-1', 'teacher-1', {
      ...input,
      criteria: [{ name: 'Tidak lengkap', levels: { '1': 'Hanya satu level' } }],
    })).rejects.toThrow('Deskripsi level 2');
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  it('creates a new immutable version through its owner-checked server RPC', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: 2, error: null });
    await expect(buatVersiRubrikKelas(
      'tenant-1', 'teacher-1', 'rubric-1', input,
    )).resolves.toBe(2);
    expect(supabase.rpc).toHaveBeenCalledWith('create_classroom_rubric_version', {
      p_rubric_id: 'rubric-1',
      p_title: 'Rubrik Presentasi',
      p_summary: 'Menilai komunikasi dan pemahaman.',
      p_criteria: input.criteria,
    });
  });

  it('surfaces database errors and rejects malformed server records', async () => {
    supabase.rpc.mockResolvedValueOnce({
      data: null,
      error: new Error('permission denied'),
    });
    await expect(buatRubrikKelas('tenant-1', 'teacher-1', input))
      .rejects.toThrow('permission denied');

    supabase.from.mockReturnValue(queryBuilder({
      data: [{ id: 'malformed', classroom_rubric_versions: [] }],
      error: null,
    }));
    await expect(muatRubrikKelas('tenant-1', 'teacher-1'))
      .rejects.toThrow('Data rubrik dari server tidak valid.');
  });
});
