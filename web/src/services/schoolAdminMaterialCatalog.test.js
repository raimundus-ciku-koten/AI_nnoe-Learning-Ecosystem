import { afterEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../lib/supabase.ts', () => ({ supabase: { rpc } }));

import { muatKatalogMateriAdminSekolah } from './schoolAdminMaterialCatalog.js';

const row = {
  material_id: 'material-1',
  classroom_id: 'class-1',
  classroom_name: 'Kelas VII A',
  subject: 'Matematika',
  title: 'Pecahan',
  created_at: '2026-10-20T10:00:00Z',
  updated_at: '2026-10-21T10:00:00Z',
};

describe('school admin material catalog service', () => {
  afterEach(() => rpc.mockReset());

  it('maps only material index metadata returned by the tenant RPC', async () => {
    rpc.mockResolvedValue({ data: [row], error: null });
    await expect(muatKatalogMateriAdminSekolah()).resolves.toEqual([{
      id: row.material_id,
      classroomId: row.classroom_id,
      classroomName: row.classroom_name,
      subject: row.subject,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }]);
    expect(rpc).toHaveBeenCalledWith('school_admin_classroom_material_catalog');
  });

  it('rejects malformed rows, duplicate records, and oversized results', async () => {
    rpc.mockResolvedValueOnce({ data: [{ ...row, updated_at: 'invalid' }], error: null });
    await expect(muatKatalogMateriAdminSekolah()).rejects.toThrow('katalog materi yang tidak valid');

    rpc.mockResolvedValueOnce({ data: [row, row], error: null });
    await expect(muatKatalogMateriAdminSekolah()).rejects.toThrow('katalog materi yang tidak valid');

    rpc.mockResolvedValueOnce({ data: Array.from({ length: 51 }, (_, index) => ({
      ...row,
      material_id: `material-${index}`,
    })), error: null });
    await expect(muatKatalogMateriAdminSekolah()).rejects.toThrow('katalog materi yang tidak valid');
  });

  it('surfaces permission and server failures', async () => {
    const serverError = new Error('permission denied');
    rpc.mockResolvedValue({ data: null, error: serverError });
    await expect(muatKatalogMateriAdminSekolah()).rejects.toBe(serverError);
  });
});
