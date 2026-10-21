import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabase } = vi.hoisted(() => ({ supabase: { from: vi.fn() } }));
vi.mock('../lib/supabase.ts', () => ({ supabase }));

import {
  hapusSoalBank,
  muatBankSoal,
  tambahSoalBank,
  ubahSoalBank,
} from './questionBank.js';

function makeQuery(response) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    insert: vi.fn(() => query),
    update: vi.fn(() => query),
    delete: vi.fn(() => query),
    single: vi.fn(() => Promise.resolve(response)),
    maybeSingle: vi.fn(() => Promise.resolve(response)),
    then: (resolve, reject) => Promise.resolve(response).then(resolve, reject),
  };
  return query;
}

const soal = {
  mapel: 'Matematika',
  kelas: 'X',
  jenis: 'pilihan_ganda',
  pertanyaan: 'Berapakah 2 + 2?',
  pilihan: ['3', '4'],
  jawaban: '4',
  pembahasan: '',
};

const row = {
  id: 'question-id',
  tenant_id: 'school-1',
  owner_id: 'teacher-1',
  ...soal,
  created_at: '2026-10-18T00:00:00Z',
  updated_at: '2026-10-18T01:00:00Z',
};

describe('Supabase question bank', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads the latest tenant questions and maps their owners and timestamps', async () => {
    const query = makeQuery({ data: [row], error: null });
    supabase.from.mockReturnValueOnce(query);

    await expect(muatBankSoal('school-1')).resolves.toEqual([{
      id: 'question-id',
      ownerUid: 'teacher-1',
      ...soal,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }]);
    expect(supabase.from).toHaveBeenCalledWith('question_bank');
    expect(query.eq).toHaveBeenCalledWith('tenant_id', 'school-1');
    expect(query.order).toHaveBeenCalledWith('updated_at', { ascending: false });
    expect(query.limit).toHaveBeenCalledWith(100);
  });

  it('creates with the authenticated owner and returns the saved row', async () => {
    const query = makeQuery({ data: row, error: null });
    supabase.from.mockReturnValueOnce(query);

    await expect(tambahSoalBank('school-1', 'teacher-1', soal)).resolves.toMatchObject({
      id: 'question-id',
      ownerUid: 'teacher-1',
      updatedAt: row.updated_at,
    });
    expect(query.insert).toHaveBeenCalledWith({
      tenant_id: 'school-1',
      owner_id: 'teacher-1',
      ...soal,
    });
  });

  it('updates and deletes only the tenant row owned by the current teacher', async () => {
    const update = makeQuery({ data: row, error: null });
    const remove = makeQuery({ data: { id: row.id }, error: null });
    supabase.from.mockReturnValueOnce(update).mockReturnValueOnce(remove);

    await ubahSoalBank('school-1', 'teacher-1', row.id, soal);
    await hapusSoalBank('school-1', 'teacher-1', row.id);
    expect(update.eq.mock.calls).toEqual([
      ['tenant_id', 'school-1'],
      ['owner_id', 'teacher-1'],
      ['id', 'question-id'],
    ]);
    expect(remove.eq.mock.calls).toEqual(update.eq.mock.calls);
  });

  it('rejects invalid ownership, invalid answer choices, and missing target rows', async () => {
    await expect(muatBankSoal('')).rejects.toThrow('tenant sekolah');
    await expect(tambahSoalBank('school-1', '', soal)).rejects.toThrow('Sesi pengguna');
    await expect(tambahSoalBank('school-1', 'teacher-1', { ...soal, jawaban: '5' }))
      .rejects.toThrow('Pilihan dan jawaban');

    supabase.from.mockReturnValueOnce(makeQuery({ data: null, error: null }));
    await expect(ubahSoalBank('school-1', 'teacher-1', row.id, soal))
      .rejects.toThrow('tidak ditemukan');

    supabase.from.mockReturnValueOnce(makeQuery({ data: null, error: null }));
    await expect(hapusSoalBank('school-1', 'teacher-1', row.id))
      .rejects.toThrow('tidak ditemukan');
  });

  it('surfaces Supabase errors and rejects malformed result rows', async () => {
    supabase.from.mockReturnValueOnce(makeQuery({ data: null, error: new Error('denied') }));
    await expect(muatBankSoal('school-1')).rejects.toThrow('denied');

    supabase.from.mockReturnValueOnce(makeQuery({ data: [{}], error: null }));
    await expect(muatBankSoal('school-1')).rejects.toThrow('baris bank soal');
  });
});
