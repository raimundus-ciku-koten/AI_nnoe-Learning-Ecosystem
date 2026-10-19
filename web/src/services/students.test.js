import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabase, queries } = vi.hoisted(() => ({
  supabase: { from: vi.fn() },
  queries: [],
}));

vi.mock('../lib/supabase.ts', () => ({ supabase }));

import { muatSiswa, tambahBanyakSiswa, tambahSiswa, ubahSiswa } from './students.js';

function queryWith(response) {
  const calls = [];
  const query = {
    calls,
    select: vi.fn((...args) => { calls.push(['select', ...args]); return query; }),
    eq: vi.fn((...args) => { calls.push(['eq', ...args]); return query; }),
    order: vi.fn((...args) => { calls.push(['order', ...args]); return query; }),
    insert: vi.fn((...args) => { calls.push(['insert', ...args]); return query; }),
    update: vi.fn((...args) => { calls.push(['update', ...args]); return query; }),
    maybeSingle: vi.fn(() => Promise.resolve(response)),
    single: vi.fn(() => Promise.resolve(response)),
    then(resolve, reject) { return Promise.resolve(response).then(resolve, reject); },
  };
  return query;
}

const row = (id, name = 'Ayu') => ({
  id,
  nama: name,
  kelas: '7A',
  nisn: null,
  jk: 'P',
  kode_unik: 'ALE-0123456789ABCDEF0123456789ABCDEF',
  created_at: '2026-10-18T00:00:00Z',
  updated_at: '2026-10-18T00:00:00Z',
});

beforeEach(() => {
  queries.length = 0;
  supabase.from.mockImplementation((table) => {
    const query = queries.shift();
    query.table = table;
    return query;
  });
});

describe('Supabase student service', () => {
  it('loads the owner roster and maps Supabase fields to the UI model', async () => {
    supabase.from.mockImplementationOnce(() => queryWith({ data: [row('12345678-1234-1234-1234-123456789012')], error: null }));

    const students = await muatSiswa('owner-1');

    expect(students[0]).toMatchObject({
      id: '12345678-1234-1234-1234-123456789012',
      nama: 'Ayu',
      jk: 'P',
      kodeUnik: 'ALE-0123456789ABCDEF0123456789ABCDEF',
      urlScan: 'https://ainnoe.app/#/scan/ALE-0123456789ABCDEF0123456789ABCDEF',
    });
  });

  it('inserts a student using the active tenant and returns the database-generated ID', async () => {
    const query = queryWith({ data: row('12345678-1234-1234-1234-123456789012'), error: null });
    supabase.from.mockReturnValueOnce(query);

    const student = await tambahSiswa({
      tenantId: 'school-1',
      ownerId: 'owner-1',
      nama: 'Ayu',
      kelas: '7A',
      nisn: '',
      jk: 'P',
      kodeUnik: 'ALE-7A-123456-0000',
    });

    expect(student.id).toBe('12345678-1234-1234-1234-123456789012');
    expect(query.insert).toHaveBeenCalledWith({
      tenant_id: 'school-1',
      owner_id: 'owner-1',
      nama: 'Ayu',
      kelas: '7A',
      nisn: null,
      jk: 'P',
      kode_unik: 'ALE-7A-123456-0000',
    });
  });

  it('chunks imports at the schema-safe 200-row batch size and maps returned IDs', async () => {
    const first = Array.from({ length: 200 }, (_, index) => row(`id-${index}`));
    const second = [row('id-200', 'Budi')];
    const firstQuery = queryWith({ data: first, error: null });
    const secondQuery = queryWith({ data: second, error: null });
    supabase.from.mockReturnValueOnce(firstQuery).mockReturnValueOnce(secondQuery);
    const input = Array.from({ length: 201 }, (_, index) => ({
      tenantId: 'school-1',
      ownerId: 'owner-1',
      nama: `Siswa ${index}`,
      kelas: '7A',
      kodeUnik: `ALE-7A-${String(index).padStart(6, '0')}-0000`,
    }));

    const saved = await tambahBanyakSiswa(input);

    expect(firstQuery.insert.mock.calls[0][0]).toHaveLength(200);
    expect(secondQuery.insert.mock.calls[0][0]).toHaveLength(1);
    expect(saved).toHaveLength(201);
    expect(saved[200].id).toBe('id-200');
  });

  it('updates editable fields only and scopes the update to the owner and row', async () => {
    const query = queryWith({ data: row('12345678-1234-1234-1234-123456789012'), error: null });
    supabase.from.mockReturnValueOnce(query);

    await ubahSiswa('owner-1', 'student-1', { nama: 'Ayu', kelas: '8A', nisn: '', jk: 'P' });

    expect(query.update).toHaveBeenCalledWith({ nama: 'Ayu', kelas: '8A', nisn: null, jk: 'P' });
    expect(query.eq.mock.calls).toEqual([['owner_id', 'owner-1'], ['id', 'student-1']]);
  });
});
