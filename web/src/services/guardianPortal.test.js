import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabase } = vi.hoisted(() => ({ supabase: { rpc: vi.fn() } }));
vi.mock('../lib/supabase.ts', () => ({ supabase }));

import {
    lepasTautanWali,
    muatAkunWaliTenant,
    muatAnakTertaut,
    muatNilaiAnak,
    muatPresensiAnak,
    muatSiswaTenantUntukWali,
    muatTautanWaliTenant,
    tautkanWali,
} from './guardianPortal.js';

describe('guardian portal Supabase RPC contract', () => {
    beforeEach(() => vi.clearAllMocks());

    it('loads the tenant-scoped management lists and parent-linked children', async () => {
        supabase.rpc
            .mockResolvedValueOnce({ data: [{ user_id: 'parent-1', nama: 'Wali', email: 'wali@example.com' }], error: null })
            .mockResolvedValueOnce({ data: [{ student_id: 'student-1', nama: 'Siswa', kelas: '7A' }], error: null })
            .mockResolvedValueOnce({ data: [{ student_id: 'student-1', guardian_user_id: 'parent-1', student_nama: 'Siswa', guardian_nama: 'Wali', relationship: 'ibu' }], error: null })
            .mockResolvedValueOnce({ data: [{ student_id: 'student-1', nama: 'Siswa', kelas: '7A', relationship: 'ibu' }], error: null });

        await expect(muatAkunWaliTenant()).resolves.toHaveLength(1);
        await expect(muatSiswaTenantUntukWali()).resolves.toHaveLength(1);
        await expect(muatTautanWaliTenant()).resolves.toHaveLength(1);
        await expect(muatAnakTertaut()).resolves.toHaveLength(1);
        expect(supabase.rpc.mock.calls.map(([name]) => name)).toEqual([
            'admin_guardian_accounts', 'admin_guardian_students',
            'admin_student_guardian_links', 'parent_linked_students',
        ]);
    });

    it('validates relationship and student IDs before mutation', async () => {
        await expect(tautkanWali('student-1', 'parent-1', 'teman')).rejects.toThrow('Hubungan keluarga');
        await expect(lepasTautanWali('', 'parent-1')).rejects.toThrow('Siswa wajib');
        supabase.rpc.mockResolvedValueOnce({ data: null, error: null })
            .mockResolvedValueOnce({ data: null, error: null });
        await expect(tautkanWali('student-1', 'parent-1', 'wali')).resolves.toBeUndefined();
        await expect(lepasTautanWali('student-1', 'parent-1')).resolves.toBeUndefined();
    });

    it('rejects attendance or results with unexpected private fields or values', async () => {
        supabase.rpc.mockResolvedValueOnce({
            data: [{ tanggal: '2026-10-30', status: 'hadir', waktu: '2026-10-30T01:00:00Z' }], error: null,
        }).mockResolvedValueOnce({
            data: [{ exam_id: 'exam-1', title: 'Ulangan', kelas: '7A', submitted_at: '2026-10-30T01:00:00Z', score: 90, grade_pending: false }], error: null,
        });
        await expect(muatPresensiAnak('student-1')).resolves.toHaveLength(1);
        await expect(muatNilaiAnak('student-1')).resolves.toHaveLength(1);

        supabase.rpc.mockResolvedValueOnce({ data: [{ tanggal: '2026-10-30', status: 'alfa', waktu: '2026-10-30T01:00:00Z' }], error: null });
        await expect(muatPresensiAnak('student-1')).rejects.toThrow('tidak valid');
    });
});