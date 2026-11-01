import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabase } = vi.hoisted(() => ({ supabase: { from: vi.fn() } }));
vi.mock('../lib/supabase.ts', () => ({ supabase }));

import {
  bersihkanJurnal,
  dapatMengelolaJurnal,
  hapusJurnal,
  muatJurnal,
  rentangBulanJurnal,
  tambahJurnal,
  ubahJurnal,
} from './lessonJournal.js';

function makeQuery(response) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    gte: vi.fn(() => query),
    lt: vi.fn(() => query),
    or: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => Promise.resolve(response)),
    insert: vi.fn(() => query),
    update: vi.fn(() => query),
    delete: vi.fn(() => query),
    single: vi.fn(() => Promise.resolve(response)),
    maybeSingle: vi.fn(() => Promise.resolve(response)),
  };
  return query;
}

const journal = {
  tanggal: '2026-10-18',
  kelas: 'X',
  mapel: 'Matematika',
  jam: '1-2',
  materi: 'Persamaan linear',
  kegiatan: 'Diskusi dan latihan',
  kendala: '',
  tindakLanjut: 'Latihan tambahan',
  status: 'draft',
};

const row = {
  id: '00000000-0000-4000-8000-000000000001',
  tenant_id: 'school-1',
  owner_id: 'teacher-1',
  ...journal,
  tindak_lanjut: journal.tindakLanjut,
  created_at: '2026-10-18T00:00:00Z',
  updated_at: '2026-10-18T00:00:00Z',
};

describe('Supabase lesson journals', () => {
  beforeEach(() => vi.clearAllMocks());

  it('validates and normalizes journal input and month boundaries', () => {
    expect(bersihkanJurnal({ ...journal, materi: '  Persamaan linear  ' }).materi)
      .toBe('Persamaan linear');
    expect(rentangBulanJurnal('2026-12')).toEqual({
      dari: '2026-12-01',
      sampai: '2027-01-01',
    });
    expect(() => rentangBulanJurnal('2026-13')).toThrow('bulan riwayat');
    expect(() => bersihkanJurnal({ ...journal, tanggal: '2026-02-30' })).toThrow('Tanggal');
    expect(() => bersihkanJurnal({ ...journal, jam: '1/2' })).toThrow('Jam ke-');
    expect(() => bersihkanJurnal({ ...journal, materi: 123 })).toThrow('harus berupa teks');
    expect(() => bersihkanJurnal({ ...journal, status: 'published' })).toThrow('Status');
    expect(() => bersihkanJurnal({ ...journal, materi: 'x'.repeat(2001) })).toThrow('terlalu panjang');
  });

  it('lists only the requested owner and tenant, with optional class filtering', async () => {
    const query = makeQuery({ data: [row], error: null });
    supabase.from.mockReturnValueOnce(query);

    await expect(muatJurnal('school-1', 'teacher-1', {
      month: '2026-10',
      kelas: 'X',
    })).resolves.toMatchObject({
      items: [{
        id: row.id,
        tenantId: 'school-1',
        ownerUid: 'teacher-1',
        tindakLanjut: 'Latihan tambahan',
      }],
      nextCursor: null,
    });
    expect(supabase.from).toHaveBeenCalledWith('lesson_journals');
    expect(query.eq.mock.calls).toEqual([
      ['tenant_id', 'school-1'],
      ['owner_id', 'teacher-1'],
      ['kelas', 'X'],
    ]);
    expect(query.gte).toHaveBeenCalledWith('tanggal', '2026-10-01');
    expect(query.lt).toHaveBeenCalledWith('tanggal', '2026-11-01');
    expect(query.order.mock.calls).toEqual([
      ['tanggal', { ascending: false }],
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
    expect(query.limit).toHaveBeenCalledWith(51);
  });

  it('uses a stable keyset cursor and rejects invalid page settings and cursors', async () => {
    const nextRow = {
      ...row,
      id: '00000000-0000-4000-8000-000000000002',
    };
    const query = makeQuery({ data: [row, nextRow], error: null });
    supabase.from.mockReturnValueOnce(query);

    const page = await muatJurnal('school-1', 'teacher-1', {
      month: '2026-10',
      limit: 1,
    });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);

    const nextQuery = makeQuery({ data: [nextRow], error: null });
    supabase.from.mockReturnValueOnce(nextQuery);
    await muatJurnal('school-1', 'teacher-1', {
      month: '2026-10',
      cursor: page.nextCursor,
      limit: 1,
    });
    expect(nextQuery.or).toHaveBeenCalledWith(
      `tanggal.lt.${row.tanggal},and(tanggal.eq.${row.tanggal},created_at.lt.${row.created_at}),and(tanggal.eq.${row.tanggal},created_at.eq.${row.created_at},id.lt.${row.id})`,
    );
    await expect(muatJurnal('school-1', 'teacher-1', { month: '2026-10', limit: 101 }))
      .rejects.toThrow('Ukuran halaman');
    await expect(muatJurnal('school-1', 'teacher-1', {
      month: '2026-10',
      cursor: 'invalid',
    })).rejects.toThrow('Penanda halaman');
  });

  it('creates, updates, and deletes only records owned by the current teacher', async () => {
    const create = makeQuery({ data: row, error: null });
    const update = makeQuery({ data: row, error: null });
    const remove = makeQuery({ data: { id: row.id }, error: null });
    supabase.from.mockReturnValueOnce(create).mockReturnValueOnce(update).mockReturnValueOnce(remove);

    await expect(tambahJurnal('school-1', 'teacher-1', journal)).resolves.toMatchObject({
      id: row.id,
      status: 'draft',
    });
    await expect(ubahJurnal('school-1', 'teacher-1', row.id, { ...journal, status: 'final' }))
      .resolves.toMatchObject({ id: row.id });
    await expect(hapusJurnal('school-1', 'teacher-1', row.id)).resolves.toBeUndefined();

    expect(create.insert).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: 'school-1',
      owner_id: 'teacher-1',
      kelas: 'X',
      tindak_lanjut: 'Latihan tambahan',
    }));
    expect(update.eq.mock.calls).toEqual([
      ['tenant_id', 'school-1'],
      ['owner_id', 'teacher-1'],
      ['id', row.id],
    ]);
    expect(remove.eq.mock.calls).toEqual(update.eq.mock.calls);
  });

  it('rejects invalid identity, missing rows, malformed responses, and provider errors', async () => {
    await expect(muatJurnal('', 'teacher-1', { month: '2026-10' })).rejects.toThrow('tenant sekolah');
    await expect(muatJurnal('school-1', '', { month: '2026-10' })).rejects.toThrow('Sesi pengguna');
    expect(dapatMengelolaJurnal('guru_bk')).toBe(true);
    expect(dapatMengelolaJurnal('admin_sekolah')).toBe(false);

    supabase.from.mockReturnValueOnce(makeQuery({ data: null, error: null }));
    await expect(ubahJurnal('school-1', 'teacher-1', row.id, journal))
      .rejects.toThrow('tidak ditemukan');

    supabase.from.mockReturnValueOnce(makeQuery({ data: [{}], error: null }));
    await expect(muatJurnal('school-1', 'teacher-1', { month: '2026-10' }))
      .rejects.toThrow('format yang tidak valid');

    supabase.from.mockReturnValueOnce(makeQuery({ data: null, error: new Error('denied') }));
    await expect(muatJurnal('school-1', 'teacher-1', { month: '2026-10' }))
      .rejects.toThrow('denied');
  });
});
