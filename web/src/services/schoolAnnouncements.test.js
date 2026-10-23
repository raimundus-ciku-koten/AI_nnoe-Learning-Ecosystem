import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabase } = vi.hoisted(() => ({ supabase: { from: vi.fn() } }));
vi.mock('../lib/supabase.ts', () => ({ supabase }));

import {
  buatPengumumanSekolah,
  hapusPengumumanSekolah,
  muatPengumumanSekolah,
  ubahPengumumanSekolah,
} from './schoolAnnouncements.js';

const row = {
  id: 'announcement-1',
  tenant_id: 'school-a',
  author_id: 'admin-a',
  title: 'Rapat orang tua',
  body: 'Rapat dilaksanakan Jumat.',
  created_at: '2026-10-23T10:00:00.000Z',
};

function makeBuilder(result) {
  const builder = {};
  for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'order']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.limit = vi.fn(() => Promise.resolve(result));
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  return builder;
}

describe('school announcements service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads only the requested tenant and validates returned rows', async () => {
    const query = makeBuilder({ data: [row], error: null });
    supabase.from.mockReturnValueOnce(query);
    await expect(muatPengumumanSekolah(' school-a ')).resolves.toEqual([{
      id: row.id,
      tenantId: row.tenant_id,
      authorId: row.author_id,
      title: row.title,
      body: row.body,
      createdAt: row.created_at,
    }]);
    expect(supabase.from).toHaveBeenCalledWith('school_announcements');
    expect(query.eq).toHaveBeenCalledWith('tenant_id', 'school-a');
    expect(query.limit).toHaveBeenCalledWith(200);

    const malformed = makeBuilder({ data: [{ ...row, body: null }], error: null });
    supabase.from.mockReturnValueOnce(malformed);
    await expect(muatPengumumanSekolah('school-a')).rejects.toThrow('tidak valid');
  });

  it('validates content and scopes creation to caller-provided tenant and author', async () => {
    await expect(buatPengumumanSekolah('', 'admin-a', { title: 'Judul', body: 'Isi' }))
      .rejects.toThrow('sekolah');
    await expect(buatPengumumanSekolah('school-a', 'admin-a', { title: ' ', body: 'Isi' }))
      .rejects.toThrow('Judul');
    await expect(buatPengumumanSekolah('school-a', 'admin-a', {
      title: 'x'.repeat(201),
      body: 'Isi',
    })).rejects.toThrow('maksimal 200');
    expect(supabase.from).not.toHaveBeenCalled();

    const query = makeBuilder({ data: row, error: null });
    supabase.from.mockReturnValueOnce(query);
    await expect(buatPengumumanSekolah('school-a', 'admin-a', {
      title: ' Rapat orang tua ',
      body: ' Rapat dilaksanakan Jumat. ',
    })).resolves.toMatchObject({ id: row.id, title: row.title });
    expect(query.insert).toHaveBeenCalledWith({
      tenant_id: 'school-a',
      author_id: 'admin-a',
      title: 'Rapat orang tua',
      body: 'Rapat dilaksanakan Jumat.',
    });
  });

  it('tenant-scopes updates/deletes and reports stale or denied writes', async () => {
    const update = makeBuilder({ data: row, error: null });
    supabase.from.mockReturnValueOnce(update);
    await expect(ubahPengumumanSekolah('school-a', 'announcement-1', {
      title: 'Rapat',
      body: 'Besok.',
    })).resolves.toMatchObject({ id: row.id });
    expect(update.eq.mock.calls).toEqual([
      ['tenant_id', 'school-a'],
      ['id', 'announcement-1'],
    ]);

    const missing = makeBuilder({ data: null, error: null });
    supabase.from.mockReturnValueOnce(missing);
    await expect(ubahPengumumanSekolah('school-a', 'stale', {
      title: 'Rapat',
      body: 'Besok.',
    })).rejects.toThrow('tidak ditemukan');

    const deletion = makeBuilder({ data: null, error: new Error('denied') });
    supabase.from.mockReturnValueOnce(deletion);
    await expect(hapusPengumumanSekolah('school-a', 'announcement-1')).rejects.toThrow('denied');
    expect(deletion.eq.mock.calls).toEqual([
      ['tenant_id', 'school-a'],
      ['id', 'announcement-1'],
    ]);
  });
});
