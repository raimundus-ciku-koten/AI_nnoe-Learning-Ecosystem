import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state = {
    configured: true,
    result: { data: [], error: null },
    row: {
      id: 'announcement-1',
      tenant_id: 'tenant-1',
      author_id: 'user-1',
      title: 'Ulangan harian',
      body: 'Ulangan dilaksanakan hari Senin.',
      created_at: '2026-10-25T09:00:00Z',
    },
  };
  const query = {};
  for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'order', 'limit']) {
    query[method] = vi.fn(() => query);
  }
  query.single = vi.fn(() => Promise.resolve({ data: state.row, error: null }));
  query.then = (resolve, reject) => Promise.resolve(state.result).then(resolve, reject);
  const from = vi.fn(() => query);
  return { state, query, from };
});

vi.mock('../lib/supabase.ts', () => ({
  supabase: { from: mocks.from },
  get isSupabaseConfigured() { return mocks.state.configured; },
  supabaseConfigError: null,
}));

import {
  buatPengumumanSekolah,
  daftarPengumumanSekolah,
  hapusPengumumanSekolah,
  perbaruiPengumumanSekolah,
} from './schoolAnnouncements.js';

const context = { userId: 'user-1', activeRole: 'admin_sekolah', tenantId: 'tenant-1' };

describe('schoolAnnouncements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.configured = true;
    mocks.state.result = { data: [], error: null };
    mocks.state.row = {
      id: 'announcement-1',
      tenant_id: 'tenant-1',
      author_id: 'user-1',
      title: 'Ulangan harian',
      body: 'Ulangan dilaksanakan hari Senin.',
      created_at: '2026-10-25T09:00:00Z',
    };
  });

  it('memuat daftar hanya untuk tenant aktif dan membatasi hasil', async () => {
    await expect(daftarPengumumanSekolah(context)).resolves.toEqual([]);
    expect(mocks.from).toHaveBeenCalledWith('school_announcements');
    expect(mocks.query.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    expect(mocks.query.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(mocks.query.limit).toHaveBeenCalledWith(100);
  });

  it('menerbitkan pengumuman dengan tenant dan identitas penulis dari sesi', async () => {
    const item = await buatPengumumanSekolah(context, {
      title: ' Ulangan harian ',
      body: ' Ulangan hari Senin. ',
    });
    expect(item.title).toBe('Ulangan harian');
    expect(mocks.query.insert).toHaveBeenCalledWith({
      tenant_id: context.tenantId,
      author_id: context.userId,
      title: 'Ulangan harian',
      body: 'Ulangan hari Senin.',
    });
  });

  it('mengizinkan operator sesuai kebijakan RLS server', async () => {
    await expect(buatPengumumanSekolah(
      { ...context, activeRole: 'operator' },
      { title: 'Pengumuman', body: 'Informasi.' },
    )).resolves.toMatchObject({ id: 'announcement-1' });
  });

  it('mengizinkan warga sekolah membaca tetapi melarang peran non-pengelola menulis', async () => {
    await expect(daftarPengumumanSekolah({
      ...context,
      activeRole: 'guru',
    })).resolves.toEqual([]);
    await expect(daftarPengumumanSekolah({
      ...context,
      activeRole: 'demo',
    })).rejects.toThrow('tidak memiliki akses');
    await expect(buatPengumumanSekolah({
      ...context,
      activeRole: 'guru',
    }, { title: 'Pengumuman', body: 'Informasi.' }))
      .rejects.toThrow('hanya dapat dikelola admin sekolah atau operator');
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it('menolak masukan kosong sebelum mengirim permintaan', async () => {
    await expect(buatPengumumanSekolah(context, { title: '', body: '' }))
      .rejects.toThrow('Judul wajib diisi');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('membatasi pengubahan dan penghapusan ke tenant aktif', async () => {
    await perbaruiPengumumanSekolah(context, 'announcement-1', {
      title: 'Perubahan jadwal',
      body: 'Jadwal diperbarui.',
    });
    await hapusPengumumanSekolah(context, 'announcement-1');
    expect(mocks.query.eq).toHaveBeenCalledWith('id', 'announcement-1');
    expect(mocks.query.eq).toHaveBeenCalledWith('tenant_id', context.tenantId);
  });

  it('melaporkan Supabase yang belum dikonfigurasi secara eksplisit', async () => {
    mocks.state.configured = false;
    await expect(daftarPengumumanSekolah(context))
      .rejects.toThrow('Supabase belum dikonfigurasi');
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
