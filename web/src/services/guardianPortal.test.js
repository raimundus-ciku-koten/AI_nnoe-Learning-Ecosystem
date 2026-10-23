import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabase } = vi.hoisted(() => ({ supabase: { rpc: vi.fn() } }));
vi.mock('../lib/supabase.ts', () => ({ supabase }));

import {
  lepasWaliDariSiswa,
  muatAkunWaliSekolah,
  muatRingkasanAnakWali,
  muatRosterWaliSekolah,
  muatTautanWaliSekolah,
  tautkanWaliKeSiswa,
} from './guardianPortal.js';

describe('guardian portal service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads all guardian portal data through role-scoped RPCs', async () => {
    supabase.rpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    await expect(muatAkunWaliSekolah()).resolves.toEqual([]);
    await expect(muatRosterWaliSekolah()).resolves.toEqual([]);
    await expect(muatTautanWaliSekolah()).resolves.toEqual([]);
    await expect(muatRingkasanAnakWali()).resolves.toEqual([]);
    expect(supabase.rpc.mock.calls.map(([name]) => name)).toEqual([
      'guardian_accounts',
      'guardian_student_roster',
      'linked_guardian_student_accounts',
      'parent_children_overview',
    ]);
  });

  it('requires a verified relationship before requesting a link', async () => {
    await expect(tautkanWaliKeSiswa('guardian-1', 'student-1', false))
      .rejects.toThrow('Verifikasi hubungan wali');
    await expect(tautkanWaliKeSiswa('', 'student-1', true))
      .rejects.toThrow('Akun wali tidak valid');
    expect(supabase.rpc).not.toHaveBeenCalled();

    supabase.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(tautkanWaliKeSiswa('guardian-1', 'student-1', true)).resolves.toBeUndefined();
    expect(supabase.rpc).toHaveBeenCalledWith('link_guardian_to_student', {
      p_guardian_user_id: 'guardian-1',
      p_student_id: 'student-1',
      p_relationship_verified: true,
    });
  });

  it('surfaces unlink, RPC, and malformed response errors', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: new Error('forbidden') });
    await expect(lepasWaliDariSiswa('guardian-1', 'student-1')).rejects.toThrow('forbidden');
    expect(supabase.rpc).toHaveBeenCalledWith('unlink_guardian_from_student', {
      p_guardian_user_id: 'guardian-1',
      p_student_id: 'student-1',
    });

    supabase.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(muatRingkasanAnakWali()).rejects.toThrow('Ringkasan anak tidak valid');
  });
});
