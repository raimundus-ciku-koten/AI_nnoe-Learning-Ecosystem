import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabase } = vi.hoisted(() => ({ supabase: { rpc: vi.fn() } }));
vi.mock('../lib/supabase.ts', () => ({ supabase }));

import {
    muatMenuNonaktifPengguna,
    muatMenuNonaktifSaya,
    simpanMenuNonaktifPengguna,
} from './platformMenuAccess.js';

describe('platform menu access and tenant administration service', () => {
    beforeEach(() => vi.clearAllMocks());

    it('loads personal and user-scoped menu overrides only through authorized RPCs', async () => {
        supabase.rpc
            .mockResolvedValueOnce({ data: [{ menu_key: 'platform|/platform/dashboard/statistik' }], error: null })
            .mockResolvedValueOnce({ data: [{ menu_key: 'asesmen|/asesmen/bank-soal' }], error: null });
        await expect(muatMenuNonaktifSaya()).resolves.toEqual(['platform|/platform/dashboard/statistik']);
        await expect(muatMenuNonaktifPengguna('user-1')).resolves.toEqual(['asesmen|/asesmen/bank-soal']);
        expect(supabase.rpc.mock.calls).toEqual([
            ['current_user_disabled_menu_keys'],
            ['platform_user_menu_overrides', { p_user_id: 'user-1' }],
        ]);
    });

    it('validates menu configuration and persists an atomic disabled-menu set', async () => {
        supabase.rpc.mockResolvedValueOnce({
            data: {
                changed: true,
                disabled_menu_keys: ['pelaksanaan|/pelaksanaan/jurnal'],
            },
            error: null,
        });
        await expect(simpanMenuNonaktifPengguna('user-1', ['pelaksanaan|/pelaksanaan/jurnal']))
            .resolves.toMatchObject({ changed: true });
        expect(supabase.rpc).toHaveBeenCalledWith('set_platform_user_disabled_menus', {
            p_user_id: 'user-1',
            p_disabled_menu_keys: ['pelaksanaan|/pelaksanaan/jurnal'],
        });
        await expect(simpanMenuNonaktifPengguna('user-1', ['beranda|/dashboard']))
            .rejects.toThrow('Daftar menu nonaktif');
        await expect(simpanMenuNonaktifPengguna('user-1', ['admin|/admin/%2F..']))
            .rejects.toThrow('Daftar menu nonaktif');
    });

    it('rejects malformed or privacy-expanding responses and propagates backend errors', async () => {
        supabase.rpc
            .mockResolvedValueOnce({ data: [{ menu_key: 'beranda|/dashboard' }], error: null })
            .mockResolvedValueOnce({ data: null, error: new Error('denied') });
        await expect(muatMenuNonaktifSaya()).rejects.toThrow('tidak valid');
        await expect(muatMenuNonaktifPengguna('user-1')).rejects.toThrow('denied');
        await expect(muatMenuNonaktifPengguna('')).rejects.toThrow('ID pengguna');
    });
});
