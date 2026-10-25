import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';

const mocks = vi.hoisted(() => {
  const state = {
    configured: true,
    result: { data: [], error: null },
    row: {
      id: 'record-1',
      role: 'guru',
      route: '/pelaksanaan/jurnal',
      search: '',
      title: '  Tinjau jurnal  ',
      details: 'Tindak lanjut',
      status: 'planned',
      due_date: null,
      created_at: '2026-10-25T10:00:00Z',
      updated_at: '2026-10-25T10:00:00Z',
    },
  };
  const query = {};
  for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'order']) {
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
  buatCatatanRuangKerja,
  daftarCatatanRuangKerja,
  hapusCatatanRuangKerja,
  PrivateWorkspaceSchemaUnavailableError,
  perbaruiCatatanRuangKerja,
} from './privateWorkspace.js';

const context = { userId: 'user-1', activeRole: 'guru', tenantId: 'tenant-1' };
const route = '/pelaksanaan/jurnal';

describe('privateWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.configured = true;
    mocks.state.result = { data: [], error: null };
    mocks.state.row = {
      id: 'record-1',
      role: 'guru',
      route,
      search: '',
      title: 'Tinjau jurnal',
      details: 'Tindak lanjut',
      status: 'planned',
      due_date: null,
      created_at: '2026-10-25T10:00:00Z',
      updated_at: '2026-10-25T10:00:00Z',
    };
  });

  describe('tampilan catatan pribadi saat skema belum tersedia', () => {
    it('menyembunyikan formulir dan daftar sampai tabel catatan tersedia', async () => {
      const page = await readFile(
        new URL('../pages/PrivateWorkspaceRecords.jsx', import.meta.url),
        'utf8',
      );
      expect(page).toMatch(/\{!isDemo && !schemaUnavailable && \(/);
    });
  });

  it('memuat catatan per akun, peran, dan submenu aktif', async () => {
    const result = await daftarCatatanRuangKerja(context, route);
    expect(result).toEqual([]);
    expect(mocks.from).toHaveBeenCalledWith('private_workspace_records');
    expect(mocks.query.eq).toHaveBeenCalledWith('user_id', context.userId);
    expect(mocks.query.eq).toHaveBeenCalledWith('role', context.activeRole);
    expect(mocks.query.eq).toHaveBeenCalledWith('route', route);
    expect(mocks.query.eq).toHaveBeenCalledWith('search', '');
  });

  it('menyimpan catatan dengan tenant dan nilai yang telah dinormalisasi', async () => {
    const result = await buatCatatanRuangKerja(context, route, {
      title: '  Tinjau jurnal  ',
      details: ' Tindak lanjut ',
      status: 'planned',
      dueDate: null,
    });
    expect(result.title).toBe('Tinjau jurnal');
    expect(mocks.query.insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: context.userId,
      tenant_id: context.tenantId,
      role: context.activeRole,
      route,
      search: '',
      title: 'Tinjau jurnal',
      details: 'Tindak lanjut',
    }));
  });

  it('menolak route yang bukan milik menu peran aktif', async () => {
    await expect(daftarCatatanRuangKerja(context, '/platform/tenant'))
      .rejects.toThrow('Menu ini tidak tersedia');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('melaporkan konfigurasi Supabase yang hilang tanpa membuat respons palsu', async () => {
    mocks.state.configured = false;
    await expect(daftarCatatanRuangKerja(context, route))
      .rejects.toThrow('Supabase belum dikonfigurasi');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('membedakan skema catatan yang belum diterapkan dari kegagalan permintaan umum', async () => {
    mocks.state.result = {
      data: null,
      error: { code: 'PGRST205', message: 'Could not find the table in the schema cache' },
    };
    await expect(daftarCatatanRuangKerja(context, route))
      .rejects.toBeInstanceOf(PrivateWorkspaceSchemaUnavailableError);
  });

  it('menolak masukan tidak valid sebelum memanggil Supabase', async () => {
    await expect(buatCatatanRuangKerja(context, route, {
      title: '  ',
      details: '',
      status: 'planned',
    })).rejects.toThrow('Judul wajib diisi');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('membatasi pembaruan dan penghapusan ke route, akun, dan peran pemilik', async () => {
    await perbaruiCatatanRuangKerja(context, route, 'record-1', {
      title: 'Tinjau lagi',
      details: '',
      status: 'done',
      dueDate: null,
    });
    await hapusCatatanRuangKerja(context, route, 'record-1');
    expect(mocks.query.eq).toHaveBeenCalledWith('id', 'record-1');
    expect(mocks.query.eq).toHaveBeenCalledWith('user_id', context.userId);
    expect(mocks.query.eq).toHaveBeenCalledWith('role', context.activeRole);
    expect(mocks.query.eq).toHaveBeenCalledWith('route', route);
    expect(mocks.query.eq).toHaveBeenCalledWith('search', '');
  });
});
