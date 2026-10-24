import { describe, expect, it } from 'vitest';
import { AKSI_ADMIN_SEKOLAH, AKSI_SUPERADMIN } from './dashboard.js';

describe('dashboard admin shortcuts', () => {
  it('routes school administrators to modules their role can actually use', () => {
    expect(AKSI_ADMIN_SEKOLAH.map(({ href }) => href)).toEqual([
      '#/admin/pengguna/guru',
      '#/ruang-kelas',
      '#/laporan/arsip-perencanaan',
      '#/asesmen/bank-soal',
      '#/chat',
    ]);
    expect(AKSI_ADMIN_SEKOLAH.find(({ judul }) => judul === 'Bank soal')?.ket)
      .toContain('Tinjau');
    expect(AKSI_ADMIN_SEKOLAH.some(({ href }) => href === '#/asesmen/ujian-online')).toBe(false);
  });

  it('routes superadmins to available tenant, catalog, audit, and statistics pages', () => {
    expect(AKSI_SUPERADMIN.map(({ href }) => href)).toEqual([
      '#/platform/tenant/sekolah',
      '#/platform/fitur/flags',
      '#/platform/tenant/paket',
      '#/platform/supabase-users',
      '#/platform/keamanan/audit',
      '#/platform/dashboard/statistik',
    ]);
    expect(AKSI_SUPERADMIN.some(({ href }) => href === '#/platform/ai/monitoring')).toBe(false);
    expect(AKSI_SUPERADMIN.some(({ href }) => href === '#/platform/laporan/biaya')).toBe(false);
  });
});
