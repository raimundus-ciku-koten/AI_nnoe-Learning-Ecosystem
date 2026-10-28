import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabase } = vi.hoisted(() => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock('../lib/supabase.ts', () => ({ supabase }));

import {
  hapusJadwalSiswa, muatJadwalSiswa, muatMateriSiswa, muatRuangBelajarGuru,
  tambahJadwalSiswa, tambahMateriSiswa, ubahJadwalSiswa,
} from './studentLearning.js';

function createQuery(result) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(async () => result),
    insert: vi.fn(() => query),
    update: vi.fn(() => query),
    delete: vi.fn(() => query),
    single: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
  };
  return query;
}

const tenantId = 'school-1';
const ownerId = '123e4567-e89b-42d3-a456-426614174000';
const scheduleInput = {
  kelas: 'X-1', dayOfWeek: 1, startsAt: '07:00', endsAt: '07:40',
  mapel: 'Matematika', ruang: 'A-1',
};
const materialInput = {
  kelas: 'X-1', mapel: 'Matematika', title: 'Aljabar',
  description: 'Bahan minggu ini', resourceUrl: 'https://example.edu/aljabar',
};

describe('student learning service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads student content only through the dedicated server RPCs', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(muatJadwalSiswa()).resolves.toEqual([]);
    expect(supabase.rpc).toHaveBeenLastCalledWith('student_learning_schedule');

    supabase.rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(muatMateriSiswa()).resolves.toEqual([]);
    expect(supabase.rpc).toHaveBeenLastCalledWith('student_learning_materials');
  });

  it('rejects malformed or non-HTTPS material links before sending them to Supabase', async () => {
    await expect(tambahMateriSiswa(tenantId, ownerId, {
      ...materialInput, resourceUrl: 'http://example.edu/aljabar',
    })).rejects.toThrow('HTTPS');
    await expect(tambahJadwalSiswa(tenantId, ownerId, {
      ...scheduleInput, startsAt: '08:00', endsAt: '07:00',
    })).rejects.toThrow('rentang waktu');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('limits teacher data reads to the authenticated tenant and owner', async () => {
    const scheduleQuery = createQuery({ data: [], error: null });
    const materialQuery = createQuery({ data: [], error: null });
    supabase.from.mockReturnValueOnce(scheduleQuery).mockReturnValueOnce(materialQuery);

    await expect(muatRuangBelajarGuru(tenantId, ownerId))
      .resolves.toEqual({ schedule: [], materials: [] });
    expect(scheduleQuery.eq.mock.calls).toEqual([
      ['tenant_id', tenantId], ['owner_id', ownerId],
    ]);
    expect(materialQuery.eq.mock.calls).toEqual([
      ['tenant_id', tenantId], ['owner_id', ownerId],
    ]);
  });

  it('validates, inserts, updates, and scopes schedule writes to the owner', async () => {
    const inserted = { id: 'schedule-id', ...scheduleInput };
    const insertQuery = createQuery({ data: inserted, error: null });
    supabase.from.mockReturnValueOnce(insertQuery);
    await expect(tambahJadwalSiswa(tenantId, ownerId, scheduleInput)).resolves.toEqual(inserted);
    expect(supabase.from).toHaveBeenLastCalledWith('student_class_schedule');
    expect(insertQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: tenantId,
      owner_id: ownerId,
      day_of_week: 1,
      starts_at: '07:00',
    }));

    const updateQuery = createQuery({ data: inserted, error: null });
    supabase.from.mockReturnValueOnce(updateQuery);
    await ubahJadwalSiswa(tenantId, ownerId, '123e4567-e89b-42d3-a456-426614174001', scheduleInput);
    expect(updateQuery.eq.mock.calls).toEqual([
      ['tenant_id', tenantId],
      ['owner_id', ownerId],
      ['id', '123e4567-e89b-42d3-a456-426614174001'],
    ]);
  });

  it('deletes only an identified teacher-owned schedule and propagates server errors', async () => {
    const query = createQuery({ data: { id: '123e4567-e89b-42d3-a456-426614174001' }, error: null });
    supabase.from.mockReturnValueOnce(query);
    await expect(hapusJadwalSiswa(tenantId, ownerId, '123e4567-e89b-42d3-a456-426614174001'))
      .resolves.toBeUndefined();
    expect(query.eq.mock.calls).toEqual([
      ['tenant_id', tenantId],
      ['owner_id', ownerId],
      ['id', '123e4567-e89b-42d3-a456-426614174001'],
    ]);

    supabase.rpc.mockResolvedValueOnce({ data: null, error: new Error('RPC failed') });
    await expect(muatJadwalSiswa()).rejects.toThrow('RPC failed');
  });
});
