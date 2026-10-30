import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabase } = vi.hoisted(() => ({ supabase: { rpc: vi.fn() } }));
vi.mock('../lib/supabase.ts', () => ({ supabase }));

import { muatHalamanDirektoriTenant } from './platformTenantDirectory.js';

const tenantRow = {
    tenant_id: 'school-1',
    tenant_name: 'Sekolah Satu',
    tenant_active: true,
    profile_count: 21,
    active_profile_count: 20,
    student_count: 18,
    latest_plan_name: 'Sekolah Pro',
    latest_order_status: 'paid',
    latest_order_created_at: '2026-10-30T12:00:00Z',
    latest_order_total: 8250000,
};

describe('platform tenant directory', () => {
    beforeEach(() => vi.clearAllMocks());

    it('loads a server-paginated tenant summary without owner or order identifiers', async () => {
        supabase.rpc.mockResolvedValueOnce({ data: [tenantRow], error: null });
        await expect(muatHalamanDirektoriTenant({ after: 'school-0', limit: 41 })).resolves.toEqual([{
            id: 'school-1',
            name: 'Sekolah Satu',
            active: true,
            profileCount: 21,
            activeProfileCount: 20,
            studentCount: 18,
            latestPlanName: 'Sekolah Pro',
            latestOrderStatus: 'paid',
            latestOrderCreatedAt: '2026-10-30T12:00:00Z',
            latestOrderTotal: 8250000,
        }]);
        expect(supabase.rpc).toHaveBeenCalledWith('platform_tenant_directory_page', {
            p_after: 'school-0',
            p_limit: 41,
        });
    });

    it('rejects malformed or privacy-expanding responses and invalid pagination', async () => {
        supabase.rpc.mockResolvedValueOnce({
            data: [{ ...tenantRow, owner_email: 'owner@example.test' }],
            error: null,
        });
        await expect(muatHalamanDirektoriTenant()).rejects.toThrow('tidak valid');
        supabase.rpc.mockResolvedValueOnce({
            data: [{ ...tenantRow, active_profile_count: 22 }],
            error: null,
        });
        await expect(muatHalamanDirektoriTenant()).rejects.toThrow('tidak valid');
        await expect(muatHalamanDirektoriTenant({ limit: 101 })).rejects.toThrow('Ukuran halaman');
        expect(supabase.rpc).toHaveBeenCalledTimes(2);
    });

    it('propagates backend authorization and service errors', async () => {
        supabase.rpc.mockResolvedValueOnce({ data: null, error: new Error('denied') });
        await expect(muatHalamanDirektoriTenant()).rejects.toThrow('denied');
    });
});
